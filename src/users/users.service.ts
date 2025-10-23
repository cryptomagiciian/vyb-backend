import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UserUpdateDto, UserHistoryRequestDto } from '../common/schemas/user.schemas';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stats: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      handle: user.handle,
      email: user.email,
      wallet: user.wallet,
      avatarUrl: user.avatarUrl,
      region: user.region,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      stats: user.stats,
    };
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updateData: UserUpdateDto) {
    try {
      // Check if handle is unique (if being updated)
      if (updateData.handle) {
        const existingUser = await this.prisma.user.findUnique({
          where: { handle: updateData.handle },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new BadRequestException('Handle is already taken');
        }
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: { stats: true },
      });

      this.logger.log(`User profile updated: ${userId}`);

      return {
        id: updatedUser.id,
        handle: updatedUser.handle,
        email: updatedUser.email,
        wallet: updatedUser.wallet,
        avatarUrl: updatedUser.avatarUrl,
        region: updatedUser.region,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        stats: updatedUser.stats,
      };
    } catch (error) {
      this.logger.error(`Failed to update user profile ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      throw new NotFoundException('User stats not found');
    }

    // Get current streak from Redis
    const currentStreak = await this.redis.get(`streak:${userId}`);
    const streak = currentStreak ? parseInt(currentStreak, 10) : stats.currentStreak;

    return {
      userId: stats.userId,
      xp: stats.xp,
      streak,
      bestStreak: stats.bestStreak,
      accuracy: stats.accuracy,
      lastActiveAt: new Date(), // Use current time as last active (computed field)
    };
  }

  /**
   * Get user swipe history
   */
  async getUserSwipeHistory(userId: string, request: UserHistoryRequestDto) {
    const { limit, cursor } = request;

    const where: any = { userId };
    if (cursor) {
      where.id = { lt: cursor };
    }

    const swipes = await this.prisma.swipe.findMany({
      where,
      include: {
        market: {
          select: {
            id: true,
            question: true,
            source: true,
            outcome: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Take one extra to check if there are more
    });

    const hasMore = swipes.length > limit;
    const resultSwipes = hasMore ? swipes.slice(0, limit) : swipes;

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
          outcome: swipe.market.outcome,
        },
      })),
      nextCursor: hasMore ? resultSwipes[resultSwipes.length - 1].id : undefined,
      hasMore,
    };
  }

  /**
   * Get user leaderboard position
   */
  async getUserLeaderboardPosition(userId: string): Promise<{
    xpRank: number;
    streakRank: number;
    accuracyRank: number;
    totalUsers: number;
  }> {
    try {
      const userStats = await this.prisma.userStats.findUnique({
        where: { userId },
      });

      if (!userStats) {
        throw new NotFoundException('User stats not found');
      }

      const [xpCount, streakCount, accuracyCount, totalUsers] = await Promise.all([
        this.prisma.userStats.count({
          where: { xp: { gt: userStats.xp } },
        }),
        this.prisma.userStats.count({
          where: { bestStreak: { gt: userStats.bestStreak } },
        }),
        this.prisma.userStats.count({
          where: { accuracy: { gt: userStats.accuracy } },
        }),
        this.prisma.userStats.count(),
      ]);

      const xpRank = xpCount + 1;
      const streakRank = streakCount + 1;
      const accuracyRank = accuracyCount + 1;

      return {
        xpRank,
        streakRank,
        accuracyRank,
        totalUsers,
      };
    } catch (error) {
      this.logger.error(`Failed to get leaderboard position for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(type: 'xp' | 'streak' | 'accuracy' = 'xp', limit: number = 100) {
    const orderBy = {
      xp: { xp: 'desc' as const },
      streak: { bestStreak: 'desc' as const },
      accuracy: { accuracy: 'desc' as const },
    }[type];

    const stats = await this.prisma.userStats.findMany({
      orderBy,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            avatarUrl: true,
          },
        },
      },
    });

    return stats.map((stat, index) => ({
      rank: index + 1,
      userId: stat.userId,
      handle: stat.user.handle,
      avatarUrl: stat.user.avatarUrl,
      xp: stat.xp,
      streak: stat.currentStreak,
      bestStreak: stat.bestStreak,
      accuracy: stat.accuracy,
    }));
  }

  /**
   * Update user last active timestamp
   */
  async updateLastActive(userId: string): Promise<void> {
    try {
      // Update last active timestamp in Redis instead of database
      await this.redis.set(`user:${userId}:lastActive`, new Date().toISOString(), 86400); // 24 hours TTL
    } catch (error) {
      this.logger.error(`Failed to update last active for user ${userId}:`, error);
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(userId: string, days: number = 30): Promise<{
    totalSwipes: number;
    rightSwipes: number;
    leftSwipes: number;
    averageSwipesPerDay: number;
    mostActiveDay: string;
    favoriteTags: string[];
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const swipes = await this.prisma.swipe.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
        },
        include: {
          market: {
            select: { tags: true },
          },
        },
      });

      const totalSwipes = swipes.length;
      const rightSwipes = swipes.filter(s => s.direction === 'RIGHT').length;
      const leftSwipes = totalSwipes - rightSwipes;

      // Calculate average swipes per day
      const averageSwipesPerDay = totalSwipes / days;

      // Find most active day
      const dayCounts = new Map<string, number>();
      swipes.forEach(swipe => {
        const day = swipe.createdAt.toISOString().split('T')[0];
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      });

      const mostActiveDay = Array.from(dayCounts.entries())
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'No activity';

      // Find favorite tags
      const tagCounts = new Map<string, number>();
      swipes.forEach(swipe => {
        swipe.market.tags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });

      const favoriteTags = Array.from(tagCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([tag]) => tag);

      return {
        totalSwipes,
        rightSwipes,
        leftSwipes,
        averageSwipesPerDay,
        mostActiveDay,
        favoriteTags,
      };
    } catch (error) {
      this.logger.error(`Failed to get activity summary for user ${userId}:`, error);
      return {
        totalSwipes: 0,
        rightSwipes: 0,
        leftSwipes: 0,
        averageSwipesPerDay: 0,
        mostActiveDay: 'No activity',
        favoriteTags: [],
      };
    }
  }
}
