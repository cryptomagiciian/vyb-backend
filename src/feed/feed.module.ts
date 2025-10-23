import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { RankingModule } from '../ranking/ranking.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RankingModule,
    RateLimitModule,
    ConnectorsModule,
  ],
  providers: [FeedService],
  controllers: [FeedController],
  exports: [FeedService],
})
export class FeedModule {}
