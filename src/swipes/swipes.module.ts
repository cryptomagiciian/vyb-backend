import { Module } from '@nestjs/common';
import { SwipesService } from './swipes.service';
import { SwipesController } from './swipes.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RedisModule } from '../common/redis/redis.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RateLimitModule,
  ],
  providers: [SwipesService],
  controllers: [SwipesController],
  exports: [SwipesService],
})
export class SwipesModule {}
