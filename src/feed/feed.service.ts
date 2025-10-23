import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { RankingAlgoService } from '../ranking/ranking-algo.service';
import { FeedRequestDto, FeedResponseDto, MarketItemDto } from '../common/dto/market.dto';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private rankingAlgo: RankingAlgoService,
  ) {}

  /**
   * Get next batch of markets for the feed with cursor-based pagination
   */
  async getNextMarkets(
    request: FeedRequestDto,
    userId?: string,
  ): Promise<FeedResponseDto> {
    const cursor = request.cursor;
    const limit = request.limit;
    const tags = request.tags;
    
    this.logger.log(`Getting next markets: limit=${limit}, cursor=${cursor}, tags=${tags?.join(',')}`);

    try {
      // Parse cursor if provided
      let cursorDate: Date | undefined;
      let cursorId: string | undefined;
      
      if (cursor) {
        try {
          const [dateStr, id] = cursor.split(',');
          cursorDate = new Date(dateStr);
          cursorId = id;
        } catch (error) {
          this.logger.warn(`Invalid cursor format: ${cursor}`);
        }
      }

      // Build where clause for cursor-based pagination
      const where: any = {
        endDate: { gt: new Date() }, // Only active markets
      };

      if (tags && tags.length > 0) {
        where.tags = { hasSome: tags };
      }

      if (cursorDate && cursorId) {
        where.OR = [
          { updatedAt: { lt: cursorDate } },
          { 
            updatedAt: cursorDate,
            id: { lt: cursorId }
          }
        ];
      }

      // Get markets from database
      const markets = await this.prisma.marketItem.findMany({
        where,
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit + 1, // Take one extra to check if there are more
      });

      const hasMore = markets.length > limit;
      const resultMarkets = hasMore ? markets.slice(0, limit) : markets;

      // Generate next cursor
      let nextCursor: string | undefined;
      if (hasMore && resultMarkets.length > 0) {
        const lastMarket = resultMarkets[resultMarkets.length - 1];
        nextCursor = `${lastMarket.updatedAt.toISOString()},${lastMarket.id}`;
      }

      // Convert to DTOs
      const items: MarketItemDto[] = resultMarkets.map(this.mapMarketToDto);

      this.logger.log(`Returning ${items.length} markets, hasMore: ${hasMore}`);

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      this.logger.error('Failed to get next markets:', error);
      throw error;
    }
  }

  /**
   * Get a specific market by ID
   */
  async getMarketById(marketId: string): Promise<MarketItemDto | null> {
    try {
      // Try cache first
      const cached = await this.redis.getJson<MarketItemDto>(`market:${marketId}`);
      if (cached) {
        return cached;
      }

      // Fallback to database
      const market = await this.prisma.marketItem.findUnique({
        where: { id: marketId },
      });

      if (!market) {
        return null;
      }

      const marketDto = this.mapMarketToDto(market);
      
      // Cache the result
      await this.redis.setJson(`market:${marketId}`, marketDto, 1800); // 30 minutes
      
      return marketDto;
    } catch (error) {
      this.logger.error(`Failed to get market ${marketId}:`, error);
      return null;
    }
  }

  /**
   * Get featured markets (spotlighted by admin)
   */
  async getFeaturedMarkets(limit: number = 5): Promise<MarketItemDto[]> {
    try {
      const markets = await this.prisma.marketItem.findMany({
        where: {
          featuredAt: { not: null },
          endDate: { gt: new Date() },
        },
        orderBy: { featuredAt: 'desc' },
        take: limit,
      });

      return markets.map(this.mapMarketToDto);
    } catch (error) {
      this.logger.error('Failed to get featured markets:', error);
      return [];
    }
  }

  /**
   * Get trending markets (high confidence + recent activity)
   */
  async getTrendingMarkets(limit: number = 10): Promise<MarketItemDto[]> {
    try {
      const markets = await this.prisma.marketItem.findMany({
        where: {
          endDate: { gt: new Date() },
          confidence: { gt: 0.7 },
          trendScore: { gt: 0.5 },
        },
        orderBy: [
          { trendScore: 'desc' },
          { confidence: 'desc' },
        ],
        take: limit,
      });

      return markets.map(this.mapMarketToDto);
    } catch (error) {
      this.logger.error('Failed to get trending markets:', error);
      return [];
    }
  }

  /**
   * Get markets by tags
   */
  async getMarketsByTags(tags: string[], limit: number = 20): Promise<MarketItemDto[]> {
    try {
      const markets = await this.prisma.marketItem.findMany({
        where: {
          tags: { hasSome: tags },
          endDate: { gt: new Date() },
        },
        orderBy: [
          { confidence: 'desc' },
          { updatedAt: 'desc' },
        ],
        take: limit,
      });

      return markets.map(this.mapMarketToDto);
    } catch (error) {
      this.logger.error(`Failed to get markets by tags ${tags.join(',')}:`, error);
      return [];
    }
  }

  /**
   * Get feed statistics
   */
  async getFeedStats(): Promise<{
    totalMarkets: number;
    activeMarkets: number;
    averageConfidence: number;
    topTags: Array<{ tag: string; count: number }>;
    lastUpdated: Date;
  }> {
    try {
      const [total, active, avgConfidence] = await Promise.all([
        this.prisma.marketItem.count(),
        this.prisma.marketItem.count({
          where: { endDate: { gt: new Date() } },
        }),
        this.prisma.marketItem.aggregate({
          where: { endDate: { gt: new Date() } },
          _avg: { confidence: true },
        }),
      ]);

      // Get top tags
      const markets = await this.prisma.marketItem.findMany({
        where: { endDate: { gt: new Date() } },
        select: { tags: true },
      });

      const tagCounts = new Map<string, number>();
      markets.forEach(market => {
        market.tags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });

      const topTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalMarkets: total,
        activeMarkets: active,
        averageConfidence: avgConfidence._avg.confidence || 0,
        topTags,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get feed stats:', error);
      return {
        totalMarkets: 0,
        activeMarkets: 0,
        averageConfidence: 0,
        topTags: [],
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Map Prisma market to DTO
   */
  private mapMarketToDto = (market: any): MarketItemDto => ({
    id: market.id,
    source: market.source,
    question: market.question,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    endDate: market.endDate.toISOString(),
    confidence: market.confidence,
    trendScore: market.trendScore,
    tags: market.tags,
    insight: market.insight,
    exchanges: market.exchanges as Array<{ name: string; url: string }>,
  });

  /**
   * Recalculate rankings for all markets
   */
  async recalculateRankings(): Promise<{ processed: number; updated: number }> {
    try {
      this.logger.log('Starting ranking recalculation...');

      const markets = await this.prisma.marketItem.findMany({
        where: { endDate: { gt: new Date() } },
      });

      let updated = 0;
      for (const market of markets) {
        const marketData = {
          liquidity: market.liquidity,
          volume24h: market.volume24h,
          priceChange24: market.priceChange24,
          mentionScore: market.mentionScore,
          endDate: market.endDate,
        };

        const ranking = this.rankingAlgo.calculateRanking(marketData);

        if (ranking.confidence !== market.confidence || ranking.trendScore !== market.trendScore) {
          await this.prisma.marketItem.update({
            where: { id: market.id },
            data: {
              confidence: ranking.confidence,
              trendScore: ranking.trendScore,
            },
          });
          updated++;
        }
      }

      this.logger.log(`Ranking recalculation completed: ${markets.length} processed, ${updated} updated`);

      return {
        processed: markets.length,
        updated,
      };
    } catch (error) {
      this.logger.error('Failed to recalculate rankings:', error);
      throw error;
    }
  }

  /**
   * Get feed statistics
   */
  async getFeedStats(): Promise<{
    totalMarkets: number;
    eligibleMarkets: number;
    averageConfidence: number;
    averageTrendScore: number;
  }> {
    try {
      const [totalMarkets, eligibleMarkets, avgStats] = await Promise.all([
        this.prisma.marketItem.count(),
        this.prisma.marketItem.count({ where: { eligible: true } }),
        this.prisma.marketItem.aggregate({
          where: { eligible: true },
          _avg: {
            confidence: true,
            trendScore: true,
          },
        }),
      ]);

      return {
        totalMarkets,
        eligibleMarkets,
        averageConfidence: avgStats._avg.confidence || 0,
        averageTrendScore: avgStats._avg.trendScore || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get feed stats:', error);
      throw error;
    }
  }
}