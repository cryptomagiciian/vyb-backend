import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SwipeRequestDto, SwipeResponseDto } from '../common/dto/market.dto';
import * as crypto from 'crypto';

@Injectable()
export class SwipesService {
  private readonly logger = new Logger(SwipesService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Record a user's swipe with idempotency and anti-replay protection
   */
  async recordSwipe(
    request: SwipeRequestDto,
    userId: string,
  ): Promise<SwipeResponseDto> {
    const { marketId, direction, swipeToken } = request;

    this.logger.log(`Recording swipe: user=${userId}, market=${marketId}, direction=${direction}`);

    try {
      // Check if market exists
      const market = await this.prisma.marketItem.findUnique({
        where: { id: marketId },
      });

      if (!market) {
        throw new BadRequestException('Market not found');
      }

      // Check if market is still active
      if (market.endDate <= new Date()) {
        throw new BadRequestException('Market has ended');
      }

      // Check for existing swipe (idempotency)
      const existingSwipe = await this.prisma.swipe.findUnique({
        where: {
          userId_marketId: {
            userId,
            marketId,
          },
        },
      });

      if (existingSwipe) {
        // Return existing swipe data
        const stats = await this.getUserStats(userId);
        return {
          success: true,
          xpGained: 0, // No XP for duplicate swipe
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          totalSwipes: stats.totalSwipes,
        };
      }

      // Anti-replay protection with swipe token
      if (swipeToken) {
        const tokenKey = `swipe_token:${swipeToken}`;
        const tokenUsed = await this.redis.get(tokenKey);
        
        if (tokenUsed) {
          throw new ConflictException('Swipe token already used');
        }

        // Mark token as used (expires in 1 hour)
        await this.redis.set(tokenKey, userId, 3600);
      }

      // Use database transaction for consistency
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the swipe
        const swipe = await tx.swipe.create({
          data: {
            userId,
            marketId,
            direction,
          },
        });

        // Update user stats
        const stats = await this.updateUserStats(userId, direction, tx);

        return { swipe, stats };
      });

      // Update Redis cache for real-time updates
      await this.updateStreakCache(userId, result.stats.currentStreak);

      // Calculate XP gained
      const xpGained = this.calculateXPGain(direction, result.stats.currentStreak);

      this.logger.log(`Swipe recorded successfully: user=${userId}, xp=${xpGained}, streak=${result.stats.currentStreak}`);

      return {
        success: true,
        xpGained,
        currentStreak: result.stats.currentStreak,
        bestStreak: result.stats.bestStreak,
        totalSwipes: result.stats.totalSwipes,
      };
    } catch (error) {
      this.logger.error(`Failed to record swipe: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user's swipe history with cursor-based pagination
   */
  async getSwipeHistory(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    swipes: Array<{
      id: string;
      marketId: string;
      direction: 'LEFT' | 'RIGHT';
      createdAt: string;
      market: {
        id: string;
        question: string;
        source: string;
        yesPrice: number;
        noPrice: number;
        endDate: string;
      };
    }>;
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const { limit = 50, cursor } = options;

    try {
      // Parse cursor
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

      // Build where clause
      const where: any = { userId };
      if (cursorDate && cursorId) {
        where.OR = [
          { createdAt: { lt: cursorDate } },
          { 
            createdAt: cursorDate,
            id: { lt: cursorId }
          }
        ];
      }

      // Get swipes with market data
      const swipes = await this.prisma.swipe.findMany({
        where,
        include: {
          market: {
            select: {
              id: true,
              question: true,
              source: true,
              yesPrice: true,
              noPrice: true,
              endDate: true,
            },
          },
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit + 1,
      });

      const hasMore = swipes.length > limit;
      const resultSwipes = hasMore ? swipes.slice(0, limit) : swipes;

      // Generate next cursor
      let nextCursor: string | undefined;
      if (hasMore && resultSwipes.length > 0) {
        const lastSwipe = resultSwipes[resultSwipes.length - 1];
        nextCursor = `${lastSwipe.createdAt.toISOString()},${lastSwipe.id}`;
      }

      return {
        swipes: resultSwipes.map(swipe => ({
          id: swipe.id,
          marketId: swipe.marketId,
          direction: swipe.direction,
          createdAt: swipe.createdAt.toISOString(),
          market: {
            id: swipe.market.id,
            question: swipe.market.question,
            source: swipe.market.source,
            yesPrice: swipe.market.yesPrice,
            noPrice: swipe.market.noPrice,
            endDate: swipe.market.endDate.toISOString(),
          },
        })),
        nextCursor,
        hasMore,
      };
    } catch (error) {
      this.logger.error(`Failed to get swipe history for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's current streak
   */
  async getCurrentStreak(userId: string): Promise<{
    currentStreak: number;
    bestStreak: number;
    streakType: 'RIGHT' | 'LEFT' | 'MIXED';
    lastSwipeDate?: string;
  }> {
    try {
      const stats = await this.getUserStats(userId);
      
      // Get recent swipes to determine streak type
      const recentSwipes = await this.prisma.swipe.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(stats.currentStreak, 10),
      });

      let streakType: 'RIGHT' | 'LEFT' | 'MIXED' = 'MIXED';
      if (recentSwipes.length > 0) {
        const directions = recentSwipes.map(s => s.direction);
        if (directions.every(d => d === 'RIGHT')) {
          streakType = 'RIGHT';
        } else if (directions.every(d => d === 'LEFT')) {
          streakType = 'LEFT';
        }
      }

      return {
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak,
        streakType,
        lastSwipeDate: recentSwipes[0]?.createdAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get current streak for user ${userId}:`, error);
      return {
        currentStreak: 0,
        bestStreak: 0,
        streakType: 'MIXED',
      };
    }
  }

  /**
   * Generate anti-replay swipe token
   */
  async generateSwipeToken(userId: string, marketId: string): Promise<string> {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const token = crypto
      .createHash('sha256')
      .update(`${userId}:${marketId}:${timestamp}:${random}`)
      .digest('hex');

    // Store token with short expiry (5 minutes)
    await this.redis.set(`swipe_token:${token}`, userId, 300);
    
    return token;
  }

  /**
   * Update user stats after a swipe
   */
  private async updateUserStats(
    userId: string,
    direction: 'LEFT' | 'RIGHT',
    tx: any,
  ): Promise<{
    totalSwipes: number;
    rightSwipes: number;
    currentStreak: number;
    bestStreak: number;
    xp: number;
  }> {
    // Get current stats
    let stats = await tx.userStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      // Create new stats
      stats = await tx.userStats.create({
        data: {
          userId,
          totalSwipes: 1,
          rightSwipes: direction === 'RIGHT' ? 1 : 0,
          currentStreak: 1,
          bestStreak: 1,
          xp: this.calculateXPGain(direction, 1),
        },
      });
    } else {
      // Update existing stats
      const newTotalSwipes = stats.totalSwipes + 1;
      const newRightSwipes = stats.rightSwipes + (direction === 'RIGHT' ? 1 : 0);
      
      // Calculate new streak
      const newCurrentStreak = this.calculateNewStreak(stats, direction);
      const newBestStreak = Math.max(stats.bestStreak, newCurrentStreak);
      const newXp = stats.xp + this.calculateXPGain(direction, newCurrentStreak);

      stats = await tx.userStats.update({
        where: { userId },
        data: {
          totalSwipes: newTotalSwipes,
          rightSwipes: newRightSwipes,
          currentStreak: newCurrentStreak,
          bestStreak: newBestStreak,
          xp: newXp,
        },
      });
    }

    return stats;
  }

  /**
   * Calculate new streak based on previous streak and direction
   */
  private calculateNewStreak(
    currentStats: any,
    direction: 'LEFT' | 'RIGHT',
  ): number {
    // For now, any swipe continues the streak
    // In the future, we could implement more sophisticated streak logic
    return currentStats.currentStreak + 1;
  }

  /**
   * Calculate XP gained from a swipe
   */
  private calculateXPGain(direction: 'LEFT' | 'RIGHT', streak: number): number {
    const baseXP = 10;
    const streakBonus = Math.min(streak * 2, 50); // Max 50 bonus XP
    return baseXP + streakBonus;
  }

  /**
   * Get user stats
   */
  private async getUserStats(userId: string) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });

    return stats || {
      totalSwipes: 0,
      rightSwipes: 0,
      currentStreak: 0,
      bestStreak: 0,
      xp: 0,
    };
  }

  /**
   * Get user's swipe history (alias for getSwipeHistory)
   */
  async getUserSwipeHistory(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    return this.getSwipeHistory(userId, options);
  }

  /**
   * Get user's current streak
   */
  async getUserStreak(userId: string): Promise<number> {
    try {
      const cached = await this.redis.get(`user:${userId}:streak`);
      if (cached) {
        return parseInt(cached, 10);
      }

      // Get from database
      const stats = await this.prisma.userStats.findUnique({
        where: { userId },
        select: { currentStreak: true },
      });

      const streak = stats?.currentStreak || 0;
      await this.redis.set(`user:${userId}:streak`, streak.toString(), 3600);
      return streak;
    } catch (error) {
      this.logger.error(`Failed to get user streak for ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Get market swipe statistics
   */
  async getMarketSwipeStats(marketId: string): Promise<{
    totalSwipes: number;
    leftSwipes: number;
    rightSwipes: number;
    rightSwipeRatio: number;
  }> {
    try {
      const [totalSwipes, leftSwipes, rightSwipes] = await Promise.all([
        this.prisma.swipe.count({ where: { marketId } }),
        this.prisma.swipe.count({ where: { marketId, direction: 'LEFT' } }),
        this.prisma.swipe.count({ where: { marketId, direction: 'RIGHT' } }),
      ]);

      return {
        totalSwipes,
        leftSwipes,
        rightSwipes,
        rightSwipeRatio: totalSwipes > 0 ? rightSwipes / totalSwipes : 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get market swipe stats for ${marketId}:`, error);
      return {
        totalSwipes: 0,
        leftSwipes: 0,
        rightSwipes: 0,
        rightSwipeRatio: 0,
      };
    }
  }

  /**
   * Get user's prediction accuracy
   */
  async getUserAccuracy(userId: string): Promise<number> {
    try {
      const stats = await this.prisma.userStats.findUnique({
        where: { userId },
        select: { accuracy: true },
      });

      return stats?.accuracy || 0;
    } catch (error) {
      this.logger.error(`Failed to get user accuracy for ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Update streak cache in Redis for real-time updates
   */
  private async updateStreakCache(userId: string, streak: number): Promise<void> {
    try {
      await this.redis.set(`user:${userId}:streak`, streak.toString(), 3600); // 1 hour TTL
    } catch (error) {
      this.logger.warn(`Failed to update streak cache for user ${userId}:`, error);
    }
  }
}