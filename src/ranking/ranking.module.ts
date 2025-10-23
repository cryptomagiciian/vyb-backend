import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RankingService } from './ranking.service';
import { RankingController } from './ranking.controller';
import { RankingAlgoService } from './ranking-algo.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    forwardRef(() => JobsModule),
  ],
  providers: [RankingService, RankingAlgoService],
  controllers: [RankingController],
  exports: [RankingService, RankingAlgoService],
})
export class RankingModule {}
