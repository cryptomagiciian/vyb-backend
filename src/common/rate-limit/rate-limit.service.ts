import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: any) => string; // Custom key generator
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private redis: RedisService) {}

  /**
   * Check if request is within rate limit
   * @param key - Unique identifier for the rate limit (IP, user ID, etc.)
   * @param config - Rate limit configuration
   * @returns Promise<boolean> - true if within limit, false if exceeded
   */
  async checkRateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
    const windowSeconds = Math.floor(config.windowMs / 1000);
    const redisKey = `rate_limit:${key}:${windowSeconds}`;

    try {
      const currentCount = await this.redis.incrementWithExpiry(
        redisKey,
        windowSeconds,
      );

      const isWithinLimit = currentCount <= config.maxRequests;

      if (!isWithinLimit) {
        this.logger.warn(
          `Rate limit exceeded for key: ${key}, count: ${currentCount}, limit: ${config.maxRequests}`,
        );
      }

      return isWithinLimit;
    } catch (error) {
      this.logger.error(`Rate limit check failed for key: ${key}`, error);
      // Fail open - allow request if Redis is down
      return true;
    }
  }

  /**
   * Get current rate limit status
   * @param key - Unique identifier for the rate limit
   * @param config - Rate limit configuration
   * @returns Promise<{count: number, limit: number, remaining: number, resetTime: number}>
   */
  async getRateLimitStatus(
    key: string,
    config: RateLimitConfig,
  ): Promise<{
    count: number;
    limit: number;
    remaining: number;
    resetTime: number;
  }> {
    const windowSeconds = Math.floor(config.windowMs / 1000);
    const redisKey = `rate_limit:${key}:${windowSeconds}`;

    try {
      const count = await this.redis.get(redisKey);
      const currentCount = count ? parseInt(count, 10) : 0;
      const remaining = Math.max(0, config.maxRequests - currentCount);
      const resetTime = Date.now() + config.windowMs;

      return {
        count: currentCount,
        limit: config.maxRequests,
        remaining,
        resetTime,
      };
    } catch (error) {
      this.logger.error(`Rate limit status check failed for key: ${key}`, error);
      return {
        count: 0,
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetTime: Date.now() + config.windowMs,
      };
    }
  }

  /**
   * Reset rate limit for a key
   * @param key - Unique identifier for the rate limit
   * @param config - Rate limit configuration
   */
  async resetRateLimit(key: string, config: RateLimitConfig): Promise<void> {
    const windowSeconds = Math.floor(config.windowMs / 1000);
    const redisKey = `rate_limit:${key}:${windowSeconds}`;

    try {
      await this.redis.del(redisKey);
      this.logger.log(`Rate limit reset for key: ${key}`);
    } catch (error) {
      this.logger.error(`Rate limit reset failed for key: ${key}`, error);
    }
  }

  /**
   * Generate rate limit key from request
   * @param req - Express request object
   * @param userId - Optional user ID
   * @returns string - Rate limit key
   */
  generateKey(req: any, userId?: string): string {
    if (userId) {
      return `user:${userId}`;
    }

    // Use IP address as fallback
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Predefined rate limit configurations
   */
  static readonly CONFIGS = {
    // Feed requests - 100 per minute
    FEED: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
    },
    // Swipe requests - 200 per minute
    SWIPE: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 200,
    },
    // Auth requests - 10 per minute
    AUTH: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
    },
    // Admin requests - 1000 per minute
    ADMIN: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 1000,
    },
    // General API - 1000 per hour
    GENERAL: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 1000,
    },
  } as const;
}
