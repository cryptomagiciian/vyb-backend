import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseConnector } from './base.connector';
import { RawMarket, NormalizedMarket, ConnectorConfig } from './types';

@Injectable()
export class MockConnector extends BaseConnector {
  readonly name = 'mock' as const;
  readonly config: ConnectorConfig = {
    apiUrl: 'https://mock-api.example.com',
    rateLimit: {
      requestsPerMinute: 60,
      burstLimit: 10,
    },
    retry: {
      maxRetries: 3,
      backoffMs: 1000,
    },
    timeout: 10000,
  };

  constructor(configService: ConfigService) {
    super(configService);
    this.initializeHttpClient();
  }

  async fetchMarkets(params: { since?: Date }): Promise<RawMarket[]> {
    // Return mock data for testing
    const mockMarkets: RawMarket[] = [
      {
        id: 'mock-1',
        question: 'Will Bitcoin reach $100,000 by end of 2024?',
        yesPrice: 0.65,
        noPrice: 0.35,
        volume: 1500000,
        liquidity: 500000,
        endDate: new Date('2024-12-31T23:59:59Z'),
        lastChange24h: 0.05,
        tags: ['crypto', 'bitcoin', 'price'],
        description: 'Prediction market on Bitcoin price target',
      },
      {
        id: 'mock-2',
        question: 'Will the US have a recession in 2024?',
        yesPrice: 0.25,
        noPrice: 0.75,
        volume: 800000,
        liquidity: 300000,
        endDate: new Date('2024-12-31T23:59:59Z'),
        lastChange24h: -0.02,
        tags: ['economics', 'recession', 'us'],
        description: 'Economic prediction market',
      },
      {
        id: 'mock-3',
        question: 'Will AI achieve AGI by 2025?',
        yesPrice: 0.15,
        noPrice: 0.85,
        volume: 1200000,
        liquidity: 400000,
        endDate: new Date('2025-12-31T23:59:59Z'),
        lastChange24h: 0.03,
        tags: ['ai', 'agi', 'technology'],
        description: 'Artificial General Intelligence prediction',
      },
      {
        id: 'mock-4',
        question: 'Will Tesla stock reach $300 by end of 2024?',
        yesPrice: 0.45,
        noPrice: 0.55,
        volume: 900000,
        liquidity: 350000,
        endDate: new Date('2024-12-31T23:59:59Z'),
        lastChange24h: -0.01,
        tags: ['stocks', 'tesla', 'price'],
        description: 'Tesla stock price prediction',
      },
      {
        id: 'mock-5',
        question: 'Will there be a major earthquake in California in 2024?',
        yesPrice: 0.08,
        noPrice: 0.92,
        volume: 200000,
        liquidity: 100000,
        endDate: new Date('2024-12-31T23:59:59Z'),
        lastChange24h: 0.01,
        tags: ['natural-disasters', 'earthquake', 'california'],
        description: 'Natural disaster prediction market',
      },
    ];

    return mockMarkets;
  }

  normalize(raw: RawMarket): NormalizedMarket {
    return {
      source: 'mock',
      externalId: raw.id,
      question: raw.question,
      yesPrice: raw.yesPrice,
      noPrice: raw.noPrice,
      volume: raw.volume,
      liquidity: raw.liquidity,
      endDate: raw.endDate,
      lastChange24h: raw.lastChange24h,
      tags: raw.tags,
      description: raw.description,
    };
  }

  normalizeToRaw(market: any): RawMarket {
    return {
      id: market.id,
      question: market.question,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      liquidity: market.liquidity,
      endDate: market.endDate,
      lastChange24h: market.lastChange24h,
      tags: market.tags,
      description: market.description,
    };
  }
}
