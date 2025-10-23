import { Module } from '@nestjs/common';
import { ResolutionService } from './resolution.service';
import { ResolutionController } from './resolution.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    PrismaModule,
    ConnectorsModule,
    JobsModule,
  ],
  providers: [ResolutionService],
  controllers: [ResolutionController],
  exports: [ResolutionService],
})
export class ResolutionModule {}
