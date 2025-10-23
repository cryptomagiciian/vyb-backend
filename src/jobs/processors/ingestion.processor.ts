import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConnectorsService } from '../../connectors/connectors.service';
import { RankingService } from '../../ranking/ranking.service';

export interface IngestionJobData {
  connector?: 'polymarket' | 'kalshi';
  force?: boolean;
}

@Processor('ingestion')
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private connectorsService: ConnectorsService,
    private rankingService: RankingService,
  ) {}

  @Process('pull')
  async handlePull(job: Job<IngestionJobData>) {
    const { connector, force } = job.data;
    
    this.logger.log(`Starting market ingestion${connector ? ` for ${connector}` : ''}`);
    
    try {
      const results = await this.connectorsService.fetchAndStoreMarkets();
      
      this.logger.log(
        `Ingestion completed: ${results.total} total, ${results.new} new, ${results.updated} updated, ${results.errors.length} errors`
      );

      // Trigger ranking rebuild if we have new or updated markets
      if (results.new > 0 || results.updated > 0 || force) {
        await this.rankingService.triggerRankingRebuild();
      }

      return {
        success: true,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Ingestion failed:', error);
      throw error;
    }
  }

  @Process('normalize')
  async handleNormalize(job: Job<{ rawMarkets: any[]; connector: string }>) {
    const { rawMarkets, connector } = job.data;
    
    this.logger.log(`Normalizing ${rawMarkets.length} markets from ${connector}`);
    
    try {
      const connectorInstance = this.connectorsService.getConnector(connector as any);
      if (!connectorInstance) {
        throw new Error(`Unknown connector: ${connector}`);
      }

      const normalizedMarkets = rawMarkets.map(raw => 
        connectorInstance.normalize(raw)
      );

      this.logger.log(`Normalized ${normalizedMarkets.length} markets from ${connector}`);
      
      return {
        success: true,
        normalizedMarkets,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Normalization failed for ${connector}:`, error);
      throw error;
    }
  }
}
