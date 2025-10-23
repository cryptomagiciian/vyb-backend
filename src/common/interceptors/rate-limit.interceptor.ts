import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Skip rate limiting for health checks and docs
    if (this.shouldSkipRateLimit(request.path)) {
      return next.handle();
    }

    try {
      // Check IP-based rate limit
      const ipAllowed = await this.checkIPRateLimit(request);
      if (!ipAllowed) {
        throw new HttpException(
          'Too many requests from this IP address',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check user-based rate limit for authenticated requests
      const user = (request as any).user;
      if (user) {
        const userAllowed = await this.checkUserRateLimit(user.sub, request);
        if (!userAllowed) {
          throw new HttpException(
            'Too many requests from this user',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // Check device fingerprint for additional security
      const deviceFingerprint = request.headers['x-device-fingerprint'] as string;
      if (deviceFingerprint) {
        const deviceAllowed = await this.checkDeviceRateLimit(deviceFingerprint, request);
        if (!deviceAllowed) {
          throw new HttpException(
            'Suspicious activity detected',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      return next.handle().pipe(
        tap(() => {
          // Record successful request for rate limiting
          this.recordRequest(request, user?.sub, deviceFingerprint);
        }),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiting fails
      return next.handle();
    }
  }

  private shouldSkipRateLimit(path: string): boolean {
    const skipPaths = ['/healthz', '/docs', '/docs-json', '/meta'];
    return skipPaths.some(skipPath => path.startsWith(skipPath));
  }

  private async checkIPRateLimit(request: Request): Promise<boolean> {
    const ip = this.getClientIP(request);
    const limit = this.config.get('RATE_LIMIT_IP_PER_MINUTE', 120);
    const windowMs = 60 * 1000; // 1 minute

    const key = `rate_limit:ip:${ip}`;
    const current = await this.redis.incrementWithExpiry(key, windowMs);
    
    return current <= limit;
  }

  private async checkUserRateLimit(userId: string, request: Request): Promise<boolean> {
    const path = request.path;
    
    // Different limits for different endpoints
    let limit: number;
    if (path.includes('/swipe')) {
      limit = this.config.get('RATE_LIMIT_USER_SWIPES_PER_MINUTE', 30);
    } else if (path.includes('/feed')) {
      limit = 100; // 100 feed requests per minute
    } else {
      limit = 200; // 200 general requests per minute
    }

    const windowMs = 60 * 1000; // 1 minute
    const key = `rate_limit:user:${userId}`;
    const current = await this.redis.incrementWithExpiry(key, windowMs);
    
    return current <= limit;
  }

  private async checkDeviceRateLimit(fingerprint: string, request: Request): Promise<boolean> {
    // More restrictive limits for device fingerprint
    const limit = 50; // 50 requests per minute per device
    const windowMs = 60 * 1000; // 1 minute

    const key = `rate_limit:device:${fingerprint}`;
    const current = await this.redis.incrementWithExpiry(key, windowMs);
    
    return current <= limit;
  }

  private async recordRequest(
    request: Request,
    userId?: string,
    deviceFingerprint?: string,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const path = request.path;
      const method = request.method;

      // Record request for analytics
      const analyticsData = {
        timestamp,
        path,
        method,
        userId,
        deviceFingerprint,
        ip: this.getClientIP(request),
      };

      // Store in Redis for analytics processing
      await this.redis.lpush('analytics:requests', JSON.stringify(analyticsData));
      
      // Keep only last 1000 requests
      await this.redis.ltrim('analytics:requests', 0, 999);
    } catch (error) {
      this.logger.error('Failed to record request:', error);
    }
  }

  private getClientIP(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }
}
