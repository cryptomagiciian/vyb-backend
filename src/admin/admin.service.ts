import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { RankingService } from '../ranking/ranking.service';
import { RealtimeService } from '../realtime/realtime.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private connectorsService: ConnectorsService,
    private rankingService: RankingService,
    private realtimeService: RealtimeService,
    @InjectQueue('ingestion') private ingestionQueue: Queue,
    @InjectQueue('ranking') private rankingQueue: Queue,
    @InjectQueue('insights') private insightsQueue: Queue,
    @InjectQueue('resolution') private resolutionQueue: Queue,
    @InjectQueue('analytics') private analyticsQueue: Queue,
  ) {}

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    status: string;
    timestamp: string;
    connectors: Array<{
      name: string;
      status: string;
      lastSuccess?: string;
      lastError?: string;
      errorCount: number;
    }>;
    queues: {
      ingestion: any;
      ranking: any;
      insights: any;
      resolution: any;
      analytics: any;
    };
    metrics: {
      feedLatency: number;
      swipeQPS: number;
      activeUsers: number;
      errorRate: number;
    };
  }> {
    try {
      const [connectors, queueStats, realtimeStats] = await Promise.all([
        this.connectorsService.getAllConnectorHealth(),
        this.getQueueStats(),
        this.realtimeService.getRealtimeStats(),
      ]);

      // Calculate metrics (simplified for demo)
      const metrics = {
        feedLatency: 85, // ms - would be calculated from actual metrics
        swipeQPS: 12, // requests per second
        activeUsers: realtimeStats.authenticatedConnections,
        errorRate: 0.001, // 0.1% - would be calculated from actual error logs
      };

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connectors: connectors.map(connector => ({
          name: connector.connector,
          status: connector.status,
          lastSuccess: connector.lastSuccess?.toISOString(),
          lastError: connector.lastError,
          errorCount: connector.errorCount,
        })),
        queues: queueStats,
        metrics,
      };
    } catch (error) {
      this.logger.error('Failed to get health status:', error);
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        connectors: [],
        queues: {
          ingestion: { waiting: 0, active: 0, completed: 0, failed: 0 },
          ranking: { waiting: 0, active: 0, completed: 0, failed: 0 },
          insights: { waiting: 0, active: 0, completed: 0, failed: 0 },
          resolution: { waiting: 0, active: 0, completed: 0, failed: 0 },
          analytics: { waiting: 0, active: 0, completed: 0, failed: 0 },
        },
        metrics: {
          feedLatency: 0,
          swipeQPS: 0,
          activeUsers: 0,
          errorRate: 0,
        },
      };
    }
  }

  /**
   * Get queue statistics
   */
  private async getQueueStats(): Promise<any> {
    try {
      const [ingestion, ranking, insights, resolution, analytics] = await Promise.all([
        this.ingestionQueue.getJobCounts(),
        this.rankingQueue.getJobCounts(),
        this.insightsQueue.getJobCounts(),
        this.resolutionQueue.getJobCounts(),
        this.analyticsQueue.getJobCounts(),
      ]);

      return {
        ingestion,
        ranking,
        insights,
        resolution,
        analytics,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      return {
        ingestion: { waiting: 0, active: 0, completed: 0, failed: 0 },
        ranking: { waiting: 0, active: 0, completed: 0, failed: 0 },
        insights: { waiting: 0, active: 0, completed: 0, failed: 0 },
        resolution: { waiting: 0, active: 0, completed: 0, failed: 0 },
        analytics: { waiting: 0, active: 0, completed: 0, failed: 0 },
      };
    }
  }

  /**
   * Trigger reindexing
   */
  async triggerReindex(segment: string = 'default', force: boolean = false): Promise<{
    success: boolean;
    message: string;
    segment: string;
    force: boolean;
  }> {
    try {
      // Trigger ingestion first
      await this.ingestionQueue.add('pull', { force }, {
        priority: 1,
        removeOnComplete: 5,
        removeOnFail: 3,
      });

      // Then trigger ranking rebuild
      await this.rankingQueue.add('score', { segment, force }, {
        delay: 30000, // 30 second delay to allow ingestion to complete
        priority: 1,
        removeOnComplete: 5,
        removeOnFail: 3,
      });

      this.logger.log(`Reindexing triggered for segment: ${segment}, force: ${force}`);

      return {
        success: true,
        message: 'Reindexing triggered successfully',
        segment,
        force,
      };
    } catch (error) {
      this.logger.error('Failed to trigger reindexing:', error);
      throw error;
    }
  }

  /**
   * Manage feature flags
   */
  async getFeatureFlags(): Promise<Array<{
    key: string;
    enabled: boolean;
    payload: any;
    updatedAt: string;
  }>> {
    try {
      const flags = await this.prisma.featureFlag.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      return flags.map(flag => ({
        key: flag.key,
        enabled: flag.enabled,
        payload: flag.payload,
        updatedAt: flag.updatedAt.toISOString(),
      }));
    } catch (error) {
      this.logger.error('Failed to get feature flags:', error);
      return [];
    }
  }

  /**
   * Update feature flag
   */
  async updateFeatureFlag(
    key: string,
    enabled: boolean,
    payload?: any,
  ): Promise<{
    success: boolean;
    flag: {
      key: string;
      enabled: boolean;
      payload: any;
      updatedAt: string;
    };
  }> {
    try {
      const flag = await this.prisma.featureFlag.upsert({
        where: { key },
        update: {
          enabled,
          payload,
          updatedAt: new Date(),
        },
        create: {
          key,
          enabled,
          payload,
        },
      });

      this.logger.log(`Feature flag updated: ${key} = ${enabled}`);

      return {
        success: true,
        flag: {
          key: flag.key,
          enabled: flag.enabled,
          payload: flag.payload,
          updatedAt: flag.updatedAt.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to update feature flag ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete feature flag
   */
  async deleteFeatureFlag(key: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.featureFlag.delete({
        where: { key },
      });

      this.logger.log(`Feature flag deleted: ${key}`);

      return {
        success: true,
        message: `Feature flag ${key} deleted successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to delete feature flag ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<{
    database: {
      totalUsers: number;
      totalMarkets: number;
      totalSwipes: number;
      activeUsers: number;
    };
    cache: {
      feedCacheSize: number;
      marketCacheSize: number;
      hitRate: number;
    };
    queues: any;
    realtime: {
      connections: number;
      authenticatedConnections: number;
    };
  }> {
    try {
      const [dbStats, cacheStats, queueStats, realtimeStats] = await Promise.all([
        this.getDatabaseStats(),
        this.getCacheStats(),
        this.getQueueStats(),
        this.realtimeService.getRealtimeStats(),
      ]);

      return {
        database: dbStats,
        cache: cacheStats,
        queues: queueStats,
        realtime: {
          connections: realtimeStats.totalConnections,
          authenticatedConnections: realtimeStats.authenticatedConnections,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get system metrics:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats(): Promise<{
    totalUsers: number;
    totalMarkets: number;
    totalSwipes: number;
    activeUsers: number;
  }> {
    try {
      const [totalUsers, totalMarkets, totalSwipes, activeUsers] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.marketItem.count(),
        this.prisma.swipe.count(),
        this.prisma.userStats.count(), // Simplified - count all users with stats
      ]);

      return {
        totalUsers,
        totalMarkets,
        totalSwipes,
        activeUsers,
      };
    } catch (error) {
      this.logger.error('Failed to get database stats:', error);
      return {
        totalUsers: 0,
        totalMarkets: 0,
        totalSwipes: 0,
        activeUsers: 0,
      };
    }
  }

  /**
   * Get cache statistics
   */
  private async getCacheStats(): Promise<{
    feedCacheSize: number;
    marketCacheSize: number;
    hitRate: number;
  }> {
    try {
      // This would typically involve more sophisticated cache monitoring
      // For now, we'll return placeholder values
      return {
        feedCacheSize: 1000, // Number of items in feed cache
        marketCacheSize: 5000, // Number of items in market cache
        hitRate: 0.85, // 85% cache hit rate
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      return {
        feedCacheSize: 0,
        marketCacheSize: 0,
        hitRate: 0,
      };
    }
  }

  /**
   * Clear cache
   */
  async clearCache(type: 'feed' | 'market' | 'all' = 'all'): Promise<{
    success: boolean;
    message: string;
    cleared: string[];
  }> {
    try {
      const cleared: string[] = [];

      if (type === 'feed' || type === 'all') {
        // Clear feed caches
        const feedKeys = await this.redis.getClient().keys('feed:*');
        if (feedKeys.length > 0) {
          await this.redis.getClient().del(...feedKeys);
          cleared.push(`feed (${feedKeys.length} keys)`);
        }
      }

      if (type === 'market' || type === 'all') {
        // Clear market caches
        const marketKeys = await this.redis.getClient().keys('market:*');
        if (marketKeys.length > 0) {
          await this.redis.getClient().del(...marketKeys);
          cleared.push(`market (${marketKeys.length} keys)`);
        }
      }

      this.logger.log(`Cache cleared: ${cleared.join(', ')}`);

      return {
        success: true,
        message: `Cache cleared successfully: ${cleared.join(', ')}`,
        cleared,
      };
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
      throw error;
    }
  }
}
