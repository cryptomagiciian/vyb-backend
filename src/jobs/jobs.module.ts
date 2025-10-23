import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { IngestionProcessor } from './processors/ingestion.processor';
import { RankingProcessor } from './processors/ranking.processor';
import { InsightsProcessor } from './processors/insights.processor';
import { ResolutionProcessor } from './processors/resolution.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'ingestion' },
      { name: 'ranking' },
      { name: 'insights' },
      { name: 'resolution' },
      { name: 'analytics' },
    ),
  ],
  providers: [
    IngestionProcessor,
    RankingProcessor,
    InsightsProcessor,
    ResolutionProcessor,
    AnalyticsProcessor,
  ],
  exports: [
    BullModule,
  ],
})
export class JobsModule {}
