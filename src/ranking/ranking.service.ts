import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

export interface RankingResult {
  totalMarkets: number;
  topMarkets: number;
  processingTime: number;
  segment: string;
}

export interface DiversityResult {
  sampledMarkets: number;
  diversityScore: number;
  segment: string;
}

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    @InjectQueue('ranking') private rankingQueue: Queue,
  ) {}

  /**
   * Calculate ranking score for a market (v1 deterministic algorithm)
   */
  calculateScore(market: any): number {
    const {
      volume,
      lastChange24h,
      endDate,
      liquidity,
      trendScore = 0,
    } = market;

    // Normalized volume (log scale, capped at 1)
    const normalizedVolume = Math.min(1, Math.log10(volume + 1) / 6);

    // Volatility score (price change in last 24h)
    const volatilityScore = Math.min(1, Math.abs(lastChange24h || 0) / 20);

    // Time urgency (exponential decay based on days to end)
    const daysToEnd = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const timeUrgency = Math.exp(-daysToEnd / 30);

    // Liquidity score (sigmoid function)
    const liquidityScore = liquidity 
      ? 1 / (1 + Math.exp(-0.0005 * (liquidity - 10000)))
      : 0;

    // Raw score calculation
    const rawScore = 
      0.35 * normalizedVolume +
      0.25 * volatilityScore +
      0.20 * timeUrgency +
      0.15 * liquidityScore +
      0.05 * trendScore;

    // Apply diversity penalty (will be calculated during sampling)
    return Math.max(0, Math.min(1, rawScore));
  }

  /**
   * Rebuild rankings for a segment
   */
  async rebuildRankings(segment: string = 'default', force: boolean = false): Promise<RankingResult> {
    const startTime = Date.now();
    this.logger.log(`Starting ranking rebuild for segment: ${segment}`);

    try {
      // Get all eligible markets
      const markets = await this.prisma.marketItem.findMany({
        where: {
          eligible: true,
          endDate: {
            gt: new Date(), // Only active markets
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      this.logger.log(`Found ${markets.length} eligible markets`);

      // Calculate scores and update database
      const scoredMarkets = markets.map(market => ({
        ...market,
        confidence: this.calculateScore(market),
      }));

      // Update confidence scores in database
      await this.prisma.executeTransaction(async (prisma) => {
        for (const market of scoredMarkets) {
          await prisma.marketItem.update({
            where: { id: market.id },
            data: { confidence: market.confidence },
          });
        }
      });

      // Build top-K cache in Redis
      const topK = 1000; // Keep top 1000 markets in cache
      const topMarkets = scoredMarkets
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topK);

      // Store in Redis sorted set
      const cacheKey = `feed:top:${segment}`;
      await this.redis.del(cacheKey); // Clear existing cache

      for (const market of topMarkets) {
        await this.redis.zadd(cacheKey, market.confidence, market.id);
      }

      // Set cache expiry (1 hour)
      await this.redis.expire(cacheKey, 3600);

      const processingTime = Date.now() - startTime;
      const result: RankingResult = {
        totalMarkets: markets.length,
        topMarkets: topMarkets.length,
        processingTime,
        segment,
      };

      this.logger.log(
        `Ranking rebuild completed for ${segment}: ${result.totalMarkets} markets processed, ${result.topMarkets} in cache (${processingTime}ms)`
      );

      return result;
    } catch (error) {
      this.logger.error(`Ranking rebuild failed for ${segment}:`, error);
      throw error;
    }
  }

  /**
   * Apply diversity sampling to avoid monotony
   */
  async applyDiversitySampling(segment: string, userId?: string): Promise<DiversityResult> {
    this.logger.log(`Applying diversity sampling for segment: ${segment}${userId ? `, user: ${userId}` : ''}`);

    try {
      const cacheKey = `feed:top:${segment}`;
      const topMarketIds = await this.redis.zrevrange(cacheKey, 0, 99); // Get top 100

      if (topMarketIds.length === 0) {
        return { sampledMarkets: 0, diversityScore: 0, segment };
      }

      // Get market details
      const markets = await this.prisma.marketItem.findMany({
        where: { id: { in: topMarketIds } },
        select: { id: true, tags: true, confidence: true },
      });

      // Simple diversity sampling: no two markets with same primary tag in a row
      const sampledMarkets: string[] = [];
      const usedTags = new Set<string>();

      for (const market of markets) {
        const primaryTag = market.tags[0] || 'general';
        
        if (!usedTags.has(primaryTag) || sampledMarkets.length < 5) {
          sampledMarkets.push(market.id);
          usedTags.add(primaryTag);
          
          // Reset tag tracking every 5 markets
          if (sampledMarkets.length % 5 === 0) {
            usedTags.clear();
          }
        }
      }

      // Update diversity cache
      const diversityKey = `feed:diversity:${segment}`;
      await this.redis.del(diversityKey);
      
      for (let i = 0; i < sampledMarkets.length; i++) {
        await this.redis.zadd(diversityKey, i, sampledMarkets[i]);
      }

      await this.redis.expire(diversityKey, 1800); // 30 minutes

      const diversityScore = sampledMarkets.length / markets.length;
      const result: DiversityResult = {
        sampledMarkets: sampledMarkets.length,
        diversityScore,
        segment,
      };

      this.logger.log(
        `Diversity sampling completed for ${segment}: ${result.sampledMarkets} markets sampled (diversity: ${diversityScore.toFixed(2)})`
      );

      return result;
    } catch (error) {
      this.logger.error(`Diversity sampling failed for ${segment}:`, error);
      throw error;
    }
  }

  /**
   * Get top markets for a segment with diversity applied
   */
  async getTopMarkets(segment: string, limit: number = 20): Promise<string[]> {
    try {
      // Try diversity cache first
      const diversityKey = `feed:diversity:${segment}`;
      const diversityExists = await this.redis.exists(diversityKey);
      
      if (diversityExists) {
        const marketIds = await this.redis.zrange(diversityKey, 0, limit - 1);
        if (marketIds.length > 0) {
          return marketIds;
        }
      }

      // Fallback to top markets
      const topKey = `feed:top:${segment}`;
      const marketIds = await this.redis.zrevrange(topKey, 0, limit - 1);
      
      return marketIds;
    } catch (error) {
      this.logger.error(`Failed to get top markets for ${segment}:`, error);
      return [];
    }
  }

  /**
   * Trigger ranking rebuild via job queue
   */
  async triggerRankingRebuild(segment: string = 'default', force: boolean = false): Promise<void> {
    await this.rankingQueue.add('score', { segment, force }, {
      delay: 1000, // 1 second delay to batch multiple triggers
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  /**
   * Get ranking statistics
   */
  async getRankingStats(segment: string): Promise<{
    totalMarkets: number;
    topMarkets: number;
    diversityMarkets: number;
    lastUpdated: Date | null;
  }> {
    try {
      const [topCount, diversityCount] = await Promise.all([
        this.redis.zcard(`feed:top:${segment}`),
        this.redis.zcard(`feed:diversity:${segment}`),
      ]);

      const totalMarkets = await this.prisma.marketItem.count({
        where: {
          eligible: true,
          endDate: { gt: new Date() },
        },
      });

      return {
        totalMarkets,
        topMarkets: topCount,
        diversityMarkets: diversityCount,
        lastUpdated: new Date(), // TODO: Store actual last updated time
      };
    } catch (error) {
      this.logger.error(`Failed to get ranking stats for ${segment}:`, error);
      return {
        totalMarkets: 0,
        topMarkets: 0,
        diversityMarkets: 0,
        lastUpdated: null,
      };
    }
  }
}
