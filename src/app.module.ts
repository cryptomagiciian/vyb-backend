import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { TerminusModule } from '@nestjs/terminus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FeedModule } from './feed/feed.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { RankingModule } from './ranking/ranking.module';
import { InsightsModule } from './insights/insights.module';
import { SwipesModule } from './swipes/swipes.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { ResolutionModule } from './resolution/resolution.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './common/health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    PrismaModule,
    RedisModule,

    // Job Queues
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    }),

    // Core Modules
    AuthModule,
    UsersModule,
    FeedModule,
    ConnectorsModule,
    RankingModule,
    InsightsModule,
    SwipesModule,
    ExchangesModule,
    ResolutionModule,
    RealtimeModule,
    AdminModule,
    JobsModule,
    RateLimitModule,

    // Health checks
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor,
    },
  ],
})
export class AppModule {}
