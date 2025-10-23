import { Module } from '@nestjs/common';
import { ResolutionService } from './resolution.service';
import { ResolutionController } from './resolution.controller';

@Module({
  providers: [ResolutionService],
  controllers: [ResolutionController],
  exports: [ResolutionService],
})
export class ResolutionModule {}
