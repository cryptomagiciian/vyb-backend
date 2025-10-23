import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private redis: RedisService,
  ) {}

  /**
   * Broadcast new market to all connected clients
   */
  async broadcastNewMarket(market: any, segment: string = 'default'): Promise<void> {
    try {
      // Publish to Redis for cross-instance communication
      await this.redis.publish('market:new', JSON.stringify({
        market,
        segment,
        timestamp: new Date().toISOString(),
      }));
      
      this.logger.log(`Published new market ${market.id} to segment ${segment}`);
    } catch (error) {
      this.logger.error(`Failed to publish new market:`, error);
    }
  }

  /**
   * Broadcast market update to all connected clients
   */
  async broadcastMarketUpdate(market: any, segment: string = 'default'): Promise<void> {
    try {
      // Publish to Redis for cross-instance communication
      await this.redis.publish('market:update', JSON.stringify({
        market,
        segment,
        timestamp: new Date().toISOString(),
      }));
      
      this.logger.log(`Published market update ${market.id} to segment ${segment}`);
    } catch (error) {
      this.logger.error(`Failed to publish market update:`, error);
    }
  }

  /**
   * Send notification to specific user
   */
  async sendUserNotification(userId: string, notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<void> {
    try {
      // Publish to Redis for cross-instance communication
      await this.redis.publish('user:notification', JSON.stringify({
        userId,
        notification,
        timestamp: new Date().toISOString(),
      }));
      
      this.logger.log(`Published notification to user ${userId}: ${notification.type}`);
    } catch (error) {
      this.logger.error(`Failed to publish notification to user ${userId}:`, error);
    }
  }

  /**
   * Send streak notification
   */
  async sendStreakNotification(userId: string, streak: number): Promise<void> {
    const notification = {
      type: 'streak',
      title: 'Streak Update!',
      message: `You're on a ${streak} day streak! Keep it up!`,
      data: { streak },
    };

    await this.sendUserNotification(userId, notification);
  }

  /**
   * Send XP notification
   */
  async sendXPNotification(userId: string, xpGained: number, totalXP: number): Promise<void> {
    const notification = {
      type: 'xp',
      title: 'XP Gained!',
      message: `+${xpGained} XP! Total: ${totalXP}`,
      data: { xpGained, totalXP },
    };

    await this.sendUserNotification(userId, notification);
  }

  /**
   * Send market resolution notification
   */
  async sendMarketResolutionNotification(
    userId: string,
    market: any,
    correct: boolean,
  ): Promise<void> {
    const notification = {
      type: 'resolution',
      title: 'Market Resolved!',
      message: `"${market.question}" resolved as ${market.outcome}. ${correct ? 'Correct prediction!' : 'Better luck next time!'}`,
      data: { market, correct },
    };

    await this.sendUserNotification(userId, notification);
  }

  /**
   * Get realtime statistics
   */
  async getRealtimeStats(): Promise<{
    totalConnections: number;
    authenticatedConnections: number;
    segments: Map<string, number>;
    lastActivity: Date;
  }> {
    try {
      // For now, return basic stats since we can't access gateway directly
      // In a real implementation, this would be stored in Redis or a shared state
      return {
        totalConnections: 0,
        authenticatedConnections: 0,
        segments: new Map(),
        lastActivity: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get realtime stats:', error);
      return {
        totalConnections: 0,
        authenticatedConnections: 0,
        segments: new Map(),
        lastActivity: new Date(),
      };
    }
  }

  /**
   * Setup Redis pub/sub for cross-instance communication
   */
  async setupRedisPubSub(): Promise<void> {
    try {
      // Subscribe to market events from other instances
      await this.redis.subscribe('market:new', (message) => {
        try {
          const data = JSON.parse(message);
          this.logger.log(`Received market:new from Redis: ${data.market.id}`);
          // The gateway will handle the actual broadcasting
        } catch (error) {
          this.logger.error('Failed to parse market:new message from Redis:', error);
        }
      });

      await this.redis.subscribe('market:update', (message) => {
        try {
          const data = JSON.parse(message);
          this.logger.log(`Received market:update from Redis: ${data.market.id}`);
          // The gateway will handle the actual broadcasting
        } catch (error) {
          this.logger.error('Failed to parse market:update message from Redis:', error);
        }
      });

      this.logger.log('Redis pub/sub setup completed');
    } catch (error) {
      this.logger.error('Failed to setup Redis pub/sub:', error);
    }
  }
}
