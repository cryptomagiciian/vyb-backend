import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MarketData {
  liquidity: number;
  volume24h: number;
  priceChange24: number;
  mentionScore: number;
  endDate: Date;
}

export interface RankingWeights {
  w1: number; // liquidity
  w2: number; // volume
  w3: number; // drift
  w4: number; // social
  w5: number; // time
}

export interface RankingResult {
  confidence: number;
  trendScore: number;
}

@Injectable()
export class RankingAlgoService {
  private readonly logger = new Logger(RankingAlgoService.name);
  private readonly weights: RankingWeights;

  constructor(private config: ConfigService) {
    this.weights = {
      w1: this.config.get('RANKING_W1_LIQUIDITY', 0.28),
      w2: this.config.get('RANKING_W2_VOLUME', 0.22),
      w3: this.config.get('RANKING_W3_DRIFT', 0.16),
      w4: this.config.get('RANKING_W4_SOCIAL', 0.24),
      w5: this.config.get('RANKING_W5_TIME', 0.10),
    };

    this.logger.log(`Ranking weights initialized: ${JSON.stringify(this.weights)}`);
  }

  /**
   * Calculate ranking scores for a market
   * Pure function - no side effects, fully testable
   */
  calculateRanking(market: MarketData): RankingResult {
    // Normalize liquidity (log scale, capped at 1)
    const liquidityNorm = this.normalizeLiquidity(market.liquidity);
    
    // Normalize volume (log scale, capped at 1)
    const volNorm = this.normalizeVolume(market.volume24h);
    
    // Normalize price drift (absolute value, capped at 1)
    const driftNorm = this.normalizeDrift(market.priceChange24);
    
    // Time decay (exponential decay based on hours to end)
    const timeDecay = this.calculateTimeDecay(market.endDate);
    
    // Normalize social mentions
    const socialNorm = this.normalizeSocial(market.mentionScore);
    
    // Calculate confidence score
    const confidence = this.clamp(
      this.weights.w1 * liquidityNorm +
      this.weights.w2 * volNorm +
      this.weights.w3 * driftNorm +
      this.weights.w4 * socialNorm +
      this.weights.w5 * timeDecay,
      0,
      1
    );
    
    // Calculate trend score (combination of drift and social)
    const trendScore = this.clamp(
      0.5 * driftNorm + 0.5 * socialNorm,
      0,
      1
    );

    return {
      confidence,
      trendScore,
    };
  }

  /**
   * Normalize liquidity using log scale
   * Formula: min(1, log10(liquidity + 1) / 6)
   */
  private normalizeLiquidity(liquidity: number): number {
    if (liquidity <= 0) return 0;
    return Math.min(1, Math.log10(liquidity + 1) / 6);
  }

  /**
   * Normalize volume using log scale
   * Formula: min(1, log10(volume + 1) / 6)
   */
  private normalizeVolume(volume: number): number {
    if (volume <= 0) return 0;
    return Math.min(1, Math.log10(volume + 1) / 6);
  }

  /**
   * Normalize price drift (absolute value)
   * Formula: min(1, abs(priceChange) / 20)
   */
  private normalizeDrift(priceChange: number): number {
    return Math.min(1, Math.abs(priceChange) / 20);
  }

  /**
   * Calculate time decay factor
   * Formula: e^(-(hoursToEnd/720)) where 720 hours = 30 days half-life
   */
  private calculateTimeDecay(endDate: Date): number {
    const now = new Date();
    const hoursToEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursToEnd <= 0) return 0; // Expired markets get 0 score
    
    return Math.exp(-(hoursToEnd / 720));
  }

  /**
   * Normalize social mention score
   * Formula: min(1, mentionScore / 100)
   */
  private normalizeSocial(mentionScore: number): number {
    return Math.min(1, mentionScore / 100);
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Update ranking weights (for admin configuration)
   */
  updateWeights(newWeights: Partial<RankingWeights>): void {
    this.weights.w1 = newWeights.w1 ?? this.weights.w1;
    this.weights.w2 = newWeights.w2 ?? this.weights.w2;
    this.weights.w3 = newWeights.w3 ?? this.weights.w3;
    this.weights.w4 = newWeights.w4 ?? this.weights.w4;
    this.weights.w5 = newWeights.w5 ?? this.weights.w5;

    this.logger.log(`Ranking weights updated: ${JSON.stringify(this.weights)}`);
  }

  /**
   * Get current ranking weights
   */
  getWeights(): RankingWeights {
    return { ...this.weights };
  }

  /**
   * Validate that weights sum to 1.0
   */
  validateWeights(weights: RankingWeights): boolean {
    const sum = weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5;
    return Math.abs(sum - 1.0) < 0.001; // Allow small floating point errors
  }

  /**
   * Batch calculate rankings for multiple markets
   */
  calculateBatchRankings(markets: MarketData[]): RankingResult[] {
    return markets.map(market => this.calculateRanking(market));
  }

  /**
   * Get ranking algorithm metadata
   */
  getAlgorithmInfo(): {
    version: string;
    weights: RankingWeights;
    description: string;
    formula: string;
  } {
    return {
      version: '2.0.0',
      weights: this.weights,
      description: 'Multi-factor ranking algorithm for prediction markets',
      formula: 'confidence = w1*liquidityNorm + w2*volNorm + w3*driftNorm + w4*socialNorm + w5*timeDecay',
    };
  }
}
