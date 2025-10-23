import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExchangesService {
  private readonly logger = new Logger(ExchangesService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Get exchanges for a market with UTM parameters
   */
  async getMarketExchanges(marketId: string, userId?: string): Promise<{
    marketId: string;
    exchanges: Array<{
      name: string;
      url: string;
      oddsYes?: number;
      oddsNo?: number;
      icon?: string;
    }>;
  }> {
    try {
      const market = await this.prisma.marketItem.findUnique({
        where: { id: marketId },
        select: {
          id: true,
          source: true,
          externalId: true,
          exchanges: true,
          yesPrice: true,
          noPrice: true,
        },
      });

      if (!market) {
        throw new NotFoundException('Market not found');
      }

      // Parse exchanges from JSON
      const exchanges = (market.exchanges as any[]) || [];

      // Add UTM parameters and user tracking
      const enhancedExchanges = exchanges.map(exchange => ({
        ...exchange,
        url: this.addUTMParams(exchange.url, market.source, userId),
      }));

      // Add default exchanges if none exist
      if (enhancedExchanges.length === 0) {
        enhancedExchanges.push({
          name: market.source === 'POLYMARKET' ? 'Polymarket' : 'Kalshi',
          url: this.addUTMParams(
            market.source === 'POLYMARKET' 
              ? `https://polymarket.com/market/${market.externalId}`
              : `https://kalshi.com/markets/${market.externalId}`,
            market.source,
            userId
          ),
          oddsYes: market.yesPrice,
          oddsNo: market.noPrice,
          icon: market.source === 'POLYMARKET' 
            ? 'https://polymarket.com/favicon.ico'
            : 'https://kalshi.com/favicon.ico',
        });
      }

      this.logger.log(`Retrieved ${enhancedExchanges.length} exchanges for market ${marketId}`);

      return {
        marketId,
        exchanges: enhancedExchanges,
      };
    } catch (error) {
      this.logger.error(`Failed to get exchanges for market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Add UTM parameters and tracking to exchange URLs
   */
  private addUTMParams(url: string, source: string, userId?: string): string {
    try {
      const urlObj = new URL(url);
      
      // Add UTM parameters
      urlObj.searchParams.set('utm_source', 'vyb');
      urlObj.searchParams.set('utm_medium', 'app');
      urlObj.searchParams.set('utm_campaign', 'discovery');
      urlObj.searchParams.set('ref', 'vyb');
      
      // Add user tracking if available
      if (userId) {
        urlObj.searchParams.set('user_id', userId);
      }
      
      // Add source tracking
      urlObj.searchParams.set('source', source.toLowerCase());
      
      // Add timestamp for analytics
      urlObj.searchParams.set('t', Date.now().toString());

      return urlObj.toString();
    } catch (error) {
      this.logger.error(`Failed to add UTM params to URL ${url}:`, error);
      return url; // Return original URL if parsing fails
    }
  }

  /**
   * Get exchange statistics
   */
  async getExchangeStats(): Promise<{
    totalMarkets: number;
    marketsWithExchanges: number;
    exchangeRate: number;
    topExchanges: Array<{
      name: string;
      count: number;
      percentage: number;
    }>;
  }> {
    try {
      const [totalMarkets, marketsWithExchanges] = await Promise.all([
        this.prisma.marketItem.count({
          where: { eligible: true },
        }),
        this.prisma.marketItem.count({
          where: {
            eligible: true,
            exchanges: { not: null },
          },
        }),
      ]);

      // Get exchange distribution
      const markets = await this.prisma.marketItem.findMany({
        where: {
          eligible: true,
          exchanges: { not: null },
        },
        select: { exchanges: true },
      });

      const exchangeCounts = new Map<string, number>();
      markets.forEach(market => {
        const exchanges = (market.exchanges as any[]) || [];
        exchanges.forEach(exchange => {
          const name = exchange.name || 'Unknown';
          exchangeCounts.set(name, (exchangeCounts.get(name) || 0) + 1);
        });
      });

      const topExchanges = Array.from(exchangeCounts.entries())
        .map(([name, count]) => ({
          name,
          count,
          percentage: (count / marketsWithExchanges) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalMarkets,
        marketsWithExchanges,
        exchangeRate: totalMarkets > 0 ? marketsWithExchanges / totalMarkets : 0,
        topExchanges,
      };
    } catch (error) {
      this.logger.error('Failed to get exchange stats:', error);
      return {
        totalMarkets: 0,
        marketsWithExchanges: 0,
        exchangeRate: 0,
        topExchanges: [],
      };
    }
  }
}
