import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class ResolutionService {
  private readonly logger = new Logger(ResolutionService.name);

  constructor(
    private prisma: PrismaService,
    private connectorsService: ConnectorsService,
    @InjectQueue('resolution') private resolutionQueue: Queue,
  ) {}

  /**
   * Check outcomes for markets
   */
  async checkOutcomes(
    marketId?: string,
    source?: 'polymarket' | 'kalshi',
    force: boolean = false,
  ): Promise<{
    checked: number;
    resolved: number;
    errors: number;
    results: Array<{
      marketId: string;
      outcome: string;
      resolved: boolean;
      error?: string;
    }>;
  }> {
    this.logger.log(`Checking outcomes${marketId ? ` for market ${marketId}` : ''}${source ? ` from ${source}` : ''}`);

    try {
      // Get markets to check
      const where: any = {
        outcome: 'UNKNOWN',
        endDate: { lte: new Date() }, // Only expired markets
      };

      if (marketId) {
        where.id = marketId;
      }

      if (source) {
        where.source = source.toUpperCase();
      }

      const markets = await this.prisma.marketItem.findMany({
        where,
        take: 100, // Limit to prevent overwhelming the system
      });

      this.logger.log(`Found ${markets.length} markets to check`);

      const results = [];
      let checked = 0;
      let resolved = 0;
      let errors = 0;

      for (const market of markets) {
        try {
          checked++;
          const outcome = await this.checkMarketOutcome(market);
          
          if (outcome && outcome !== 'UNKNOWN') {
            // Update market outcome
            await this.prisma.marketItem.update({
              where: { id: market.id },
              data: { outcome },
            });

            resolved++;
            results.push({
              marketId: market.id,
              outcome,
              resolved: true,
            });

            this.logger.log(`Resolved market ${market.id}: ${outcome}`);
          } else {
            results.push({
              marketId: market.id,
              outcome: 'UNKNOWN',
              resolved: false,
            });
          }
        } catch (error) {
          errors++;
          results.push({
            marketId: market.id,
            outcome: 'UNKNOWN',
            resolved: false,
            error: error.message,
          });

          this.logger.error(`Failed to check outcome for market ${market.id}:`, error);
        }
      }

      return {
        checked,
        resolved,
        errors,
        results,
      };
    } catch (error) {
      this.logger.error('Failed to check outcomes:', error);
      throw error;
    }
  }

  /**
   * Check outcome for a specific market
   */
  private async checkMarketOutcome(market: any): Promise<string | null> {
    try {
      const connector = this.connectorsService.getConnector(market.source.toLowerCase());
      if (!connector) {
        throw new Error(`No connector found for source: ${market.source}`);
      }

      // This would typically call the connector's API to get the actual outcome
      // For now, we'll implement a simple heuristic based on prices
      
      // If the market has ended and we have final prices, determine outcome
      if (market.yesPrice > 0.5) {
        return 'YES';
      } else if (market.noPrice > 0.5) {
        return 'NO';
      }

      // TODO: Implement actual API calls to get real outcomes
      // This would involve calling the connector's API with the external ID
      // and parsing the response to determine the actual outcome

      return null; // Unable to determine outcome
    } catch (error) {
      this.logger.error(`Failed to check outcome for market ${market.id}:`, error);
      return null;
    }
  }

  /**
   * Process payouts for resolved markets
   */
  async processPayouts(
    userId?: string,
    marketId?: string,
  ): Promise<{
    processed: number;
    totalXP: number;
    results: Array<{
      userId: string;
      marketId: string;
      xpAwarded: number;
      correct: boolean;
    }>;
  }> {
    this.logger.log(`Processing payouts${userId ? ` for user ${userId}` : ''}${marketId ? ` for market ${marketId}` : ''}`);

    try {
      // Get resolved markets with user swipes
      const where: any = {
        outcome: { not: 'UNKNOWN' },
        swipes: {
          some: {
            direction: 'RIGHT', // Only right swipes get payouts
            ...(userId && { userId }),
          },
        },
      };

      if (marketId) {
        where.id = marketId;
      }

      const markets = await this.prisma.marketItem.findMany({
        where,
        include: {
          swipes: {
            where: {
              direction: 'RIGHT',
              ...(userId && { userId }),
            },
            include: {
              user: {
                include: { stats: true },
              },
            },
          },
        },
      });

      const results = [];
      let processed = 0;
      let totalXP = 0;

      for (const market of markets) {
        for (const swipe of market.swipes) {
          try {
            const correct = this.isPredictionCorrect(market, swipe);
            const xpAwarded = correct ? 50 : 0; // Award XP for correct predictions

            if (xpAwarded > 0) {
              // Update user XP
              await this.prisma.userStats.update({
                where: { userId: swipe.userId },
                data: {
                  xp: { increment: xpAwarded },
                },
              });

              totalXP += xpAwarded;
            }

            processed++;
            results.push({
              userId: swipe.userId,
              marketId: market.id,
              xpAwarded,
              correct,
            });

            this.logger.log(
              `Processed payout for user ${swipe.userId}, market ${market.id}: ${xpAwarded} XP (correct: ${correct})`
            );
          } catch (error) {
            this.logger.error(
              `Failed to process payout for user ${swipe.userId}, market ${market.id}:`,
              error
            );
          }
        }
      }

      return {
        processed,
        totalXP,
        results,
      };
    } catch (error) {
      this.logger.error('Failed to process payouts:', error);
      throw error;
    }
  }

  /**
   * Check if a user's prediction was correct
   */
  private isPredictionCorrect(market: any, swipe: any): boolean {
    // A right swipe means the user predicted the outcome would be "YES"
    // Check if the market outcome matches the prediction
    if (swipe.direction === 'RIGHT') {
      return market.outcome === 'YES';
    } else {
      return market.outcome === 'NO';
    }
  }

  /**
   * Queue outcome checking job
   */
  async queueOutcomeCheck(
    marketId?: string,
    source?: 'polymarket' | 'kalshi',
    force: boolean = false,
  ): Promise<void> {
    await this.resolutionQueue.add('outcomes', {
      marketId,
      source,
      force,
    }, {
      delay: 5000, // 5 second delay
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  /**
   * Queue payout processing job
   */
  async queuePayoutProcessing(
    userId?: string,
    marketId?: string,
  ): Promise<void> {
    await this.resolutionQueue.add('payouts', {
      userId,
      marketId,
    }, {
      delay: 10000, // 10 second delay
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  /**
   * Get resolution statistics
   */
  async getResolutionStats(): Promise<{
    totalMarkets: number;
    resolvedMarkets: number;
    unresolvedMarkets: number;
    resolutionRate: number;
    totalPayouts: number;
    totalXPAwarded: number;
  }> {
    try {
      const [total, resolved, unresolved] = await Promise.all([
        this.prisma.marketItem.count(),
        this.prisma.marketItem.count({
          where: { outcome: { not: 'UNKNOWN' } },
        }),
        this.prisma.marketItem.count({
          where: { outcome: 'UNKNOWN' },
        }),
      ]);

      // Get payout statistics
      const payoutStats = await this.prisma.userStats.aggregate({
        _sum: { xp: true },
      });

      return {
        totalMarkets: total,
        resolvedMarkets: resolved,
        unresolvedMarkets: unresolved,
        resolutionRate: total > 0 ? resolved / total : 0,
        totalPayouts: 0, // TODO: Track actual payout count
        totalXPAwarded: payoutStats._sum.xp || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get resolution stats:', error);
      return {
        totalMarkets: 0,
        resolvedMarkets: 0,
        unresolvedMarkets: 0,
        resolutionRate: 0,
        totalPayouts: 0,
        totalXPAwarded: 0,
      };
    }
  }
}
