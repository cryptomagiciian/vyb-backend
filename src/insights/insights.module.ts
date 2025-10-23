import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    JobsModule,
  ],
  providers: [InsightsService],
  controllers: [InsightsController],
  exports: [InsightsService],
})
export class InsightsModule {}
