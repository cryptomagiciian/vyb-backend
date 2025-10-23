import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import OpenAI from 'openai';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private configService: ConfigService,
    @InjectQueue('insights') private insightsQueue: Queue,
  ) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate insight for a market
   */
  async generateInsight(
    marketId: string,
    language: string = 'en',
    force: boolean = false,
  ): Promise<string | null> {
    try {
      // Check if insights are enabled
      if (!this.configService.get('ENABLE_INSIGHTS', 'true') === 'true') {
        this.logger.log('Insights generation is disabled');
        return null;
      }

      // Check cache first
      if (!force) {
        const cached = await this.redis.get(`insight:${marketId}:${language}`);
        if (cached) {
          this.logger.log(`Returning cached insight for market ${marketId}`);
          return cached;
        }
      }

      // Get market data
      const market = await this.prisma.marketItem.findUnique({
        where: { id: marketId },
      });

      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Check if insight already exists in database
      if (!force && market.insight) {
        // Cache the existing insight
        await this.redis.set(`insight:${marketId}:${language}`, market.insight, 86400); // 24 hours
        return market.insight;
      }

      // Generate new insight using OpenAI
      const insight = await this.generateOpenAIInsight(market, language);
      
      if (insight) {
        // Update database
        await this.prisma.marketItem.update({
          where: { id: marketId },
          data: { insight },
        });

        // Cache the insight
        await this.redis.set(`insight:${marketId}:${language}`, insight, 86400); // 24 hours

        this.logger.log(`Generated insight for market ${marketId}: ${insight.substring(0, 50)}...`);
      }

      return insight;
    } catch (error) {
      this.logger.error(`Failed to generate insight for market ${marketId}:`, error);
      return null;
    }
  }

  /**
   * Generate insight using OpenAI
   */
  private async generateOpenAIInsight(market: any, language: string): Promise<string | null> {
    if (!this.openai) {
      this.logger.warn('OpenAI API key not configured');
      return null;
    }

    try {
      const prompt = this.buildInsightPrompt(market, language);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst providing concise, neutral insights about prediction markets. Keep responses under 200 characters and avoid giving investment advice.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
      });

      const insight = response.choices[0]?.message?.content?.trim();
      return insight || null;
    } catch (error) {
      this.logger.error('OpenAI API error:', error);
      return null;
    }
  }

  /**
   * Build prompt for insight generation
   */
  private buildInsightPrompt(market: any, language: string): string {
    const priceChange = market.lastChange24h 
      ? `${market.lastChange24h > 0 ? '+' : ''}${market.lastChange24h.toFixed(1)}%`
      : 'no recent data';

    return `Market: "${market.question}"
Current odds: Yes ${(market.yesPrice * 100).toFixed(1)}%, No ${(market.noPrice * 100).toFixed(1)}%
24h change: ${priceChange}
Volume: $${market.volume.toLocaleString()}
Ends: ${new Date(market.endDate).toLocaleDateString()}
Tags: ${market.tags.join(', ')}

Provide a brief, neutral insight about why this market might be interesting. Focus on what it resolves on, notable context, or recent trends. Keep it under 200 characters.`;
  }

  /**
   * Generate insights for multiple markets
   */
  async generateBatchInsights(
    marketIds: string[],
    language: string = 'en',
  ): Promise<{
    successful: number;
    failed: number;
    results: Array<{ marketId: string; insight: string | null; error?: string }>;
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const marketId of marketIds) {
      try {
        const insight = await this.generateInsight(marketId, language);
        results.push({ marketId, insight });
        if (insight) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        results.push({ 
          marketId, 
          insight: null, 
          error: error.message 
        });
        failed++;
      }
    }

    return { successful, failed, results };
  }

  /**
   * Queue insight generation job
   */
  async queueInsightGeneration(
    marketId: string,
    language: string = 'en',
    force: boolean = false,
  ): Promise<void> {
    await this.insightsQueue.add('generate', {
      marketId,
      language,
      force,
    }, {
      delay: 1000, // 1 second delay to batch requests
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  /**
   * Queue batch insight generation
   */
  async queueBatchInsightGeneration(
    marketIds: string[],
    language: string = 'en',
  ): Promise<void> {
    await this.insightsQueue.add('batch', {
      marketIds,
      language,
    }, {
      delay: 2000, // 2 second delay
      removeOnComplete: 5,
      removeOnFail: 3,
    });
  }

  /**
   * Get insight statistics
   */
  async getInsightStats(): Promise<{
    totalMarkets: number;
    marketsWithInsights: number;
    insightRate: number;
    lastGenerated: Date | null;
  }> {
    try {
      const [total, withInsights, lastGenerated] = await Promise.all([
        this.prisma.marketItem.count({
          where: { eligible: true },
        }),
        this.prisma.marketItem.count({
          where: {
            eligible: true,
            insight: { not: null },
          },
        }),
        this.prisma.marketItem.findFirst({
          where: {
            insight: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ]);

      return {
        totalMarkets: total,
        marketsWithInsights: withInsights,
        insightRate: total > 0 ? withInsights / total : 0,
        lastGenerated: lastGenerated?.updatedAt || null,
      };
    } catch (error) {
      this.logger.error('Failed to get insight stats:', error);
      return {
        totalMarkets: 0,
        marketsWithInsights: 0,
        insightRate: 0,
        lastGenerated: null,
      };
    }
  }
}
