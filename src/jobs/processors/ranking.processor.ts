import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { RankingService } from '../../ranking/ranking.service';

export interface RankingJobData {
  segment?: string;
  force?: boolean;
}

@Processor('ranking')
export class RankingProcessor {
  private readonly logger = new Logger(RankingProcessor.name);

  constructor(private rankingService: RankingService) {}

  @Process('score')
  async handleScore(job: Job<RankingJobData>) {
    const { segment = 'default', force = false } = job.data;
    
    this.logger.log(`Starting ranking rebuild for segment: ${segment}`);
    
    try {
      const results = await this.rankingService.rebuildRankings(segment, force);
      
      this.logger.log(
        `Ranking rebuild completed for ${segment}: ${results.totalMarkets} markets processed, ${results.topMarkets} in top-K cache`
      );

      return {
        success: true,
        segment,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Ranking rebuild failed for ${segment}:`, error);
      throw error;
    }
  }

  @Process('diversity')
  async handleDiversity(job: Job<{ segment: string; userId?: string }>) {
    const { segment, userId } = job.data;
    
    this.logger.log(`Applying diversity sampling for segment: ${segment}${userId ? `, user: ${userId}` : ''}`);
    
    try {
      const results = await this.rankingService.applyDiversitySampling(segment, userId);
      
      this.logger.log(
        `Diversity sampling completed for ${segment}: ${results.sampledMarkets} markets sampled`
      );

      return {
        success: true,
        segment,
        userId,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Diversity sampling failed for ${segment}:`, error);
      throw error;
    }
  }
}
