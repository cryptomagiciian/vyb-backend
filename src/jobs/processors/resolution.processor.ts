import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ResolutionService } from '../../resolution/resolution.service';

export interface ResolutionJobData {
  marketId?: string;
  source?: 'polymarket' | 'kalshi';
  force?: boolean;
}

@Processor('resolution')
export class ResolutionProcessor {
  private readonly logger = new Logger(ResolutionProcessor.name);

  constructor(private resolutionService: ResolutionService) {}

  @Process('outcomes')
  async handleOutcomes(job: Job<ResolutionJobData>) {
    const { marketId, source, force = false } = job.data;
    
    this.logger.log(`Checking outcomes${marketId ? ` for market: ${marketId}` : ''}${source ? ` from ${source}` : ''}`);
    
    try {
      const results = await this.resolutionService.checkOutcomes(marketId, source, force);
      
      this.logger.log(
        `Outcome check completed: ${results.checked} markets checked, ${results.resolved} resolved, ${results.errors} errors`
      );

      return {
        success: true,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Outcome check failed:', error);
      throw error;
    }
  }

  @Process('payouts')
  async handlePayouts(job: Job<{ userId?: string; marketId?: string }>) {
    const { userId, marketId } = job.data;
    
    this.logger.log(`Processing payouts${userId ? ` for user: ${userId}` : ''}${marketId ? ` for market: ${marketId}` : ''}`);
    
    try {
      const results = await this.resolutionService.processPayouts(userId, marketId);
      
      this.logger.log(
        `Payout processing completed: ${results.processed} payouts processed, ${results.totalXP} XP awarded`
      );

      return {
        success: true,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Payout processing failed:', error);
      throw error;
    }
  }
}
