import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { IngestionProcessor } from './processors/ingestion.processor';
import { RankingProcessor } from './processors/ranking.processor';
import { InsightsProcessor } from './processors/insights.processor';
import { ResolutionProcessor } from './processors/resolution.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { ConnectorsModule } from '../connectors/connectors.module';
import { RankingModule } from '../ranking/ranking.module';
import { InsightsModule } from '../insights/insights.module';
import { ResolutionModule } from '../resolution/resolution.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'ingestion' },
      { name: 'ranking' },
      { name: 'insights' },
      { name: 'resolution' },
      { name: 'analytics' },
    ),
    ConnectorsModule,
    forwardRef(() => RankingModule),
    forwardRef(() => InsightsModule),
    ResolutionModule,
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
