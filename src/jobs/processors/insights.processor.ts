import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InsightsService } from '../../insights/insights.service';

export interface InsightsJobData {
  marketId: string;
  language?: string;
  force?: boolean;
}

@Processor('insights')
export class InsightsProcessor {
  private readonly logger = new Logger(InsightsProcessor.name);

  constructor(private insightsService: InsightsService) {}

  @Process('generate')
  async handleGenerate(job: Job<InsightsJobData>) {
    const { marketId, language = 'en', force = false } = job.data;
    
    this.logger.log(`Generating insight for market: ${marketId}`);
    
    try {
      const insight = await this.insightsService.generateInsight(marketId, language, force);
      
      this.logger.log(`Insight generated for market ${marketId}: ${insight?.substring(0, 50)}...`);

      return {
        success: true,
        marketId,
        language,
        insight,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Insight generation failed for market ${marketId}:`, error);
      throw error;
    }
  }

  @Process('batch')
  async handleBatch(job: Job<{ marketIds: string[]; language?: string }>) {
    const { marketIds, language = 'en' } = job.data;
    
    this.logger.log(`Batch generating insights for ${marketIds.length} markets`);
    
    try {
      const results = await this.insightsService.generateBatchInsights(marketIds, language);
      
      this.logger.log(
        `Batch insight generation completed: ${results.successful} successful, ${results.failed} failed`
      );

      return {
        success: true,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Batch insight generation failed:', error);
      throw error;
    }
  }
}
