import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseConnector } from './base.connector';
import { RawMarket, NormalizedMarket, ConnectorConfig } from './types';

interface KalshiMarket {
  id: string;
  title: string;
  yes_bid: number;
  no_bid: number;
  volume: number;
  open_interest: number;
  close_time: string;
  price_change_24h: number;
  category: string;
  tags: string[];
  description: string;
}

interface KalshiResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

@Injectable()
export class KalshiConnector extends BaseConnector {
  readonly name = 'kalshi' as const;
  readonly config: ConnectorConfig = {
    apiUrl: this.configService.get('KALSHI_API_URL', 'https://api.kalshi.com'),
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

  async fetchMarkets(params: { since?: Date }): Promise<RawMarket[]> {
    try {
      const queryParams = new URLSearchParams({
        limit: '100',
        status: 'open',
        ...(params.since && { since: params.since.toISOString() }),
      });

      const response = await this.httpClient.get<KalshiResponse>(
        `/markets?${queryParams}`,
      );

      return response.data.markets.map(this.normalizeToRaw);
    } catch (error) {
      this.logger.error('Failed to fetch Kalshi data:', error);
      throw error;
    }
  }

  normalize(raw: RawMarket): NormalizedMarket {
    return {
      source: 'kalshi',
      externalId: raw.id,
      question: raw.question,
      yesPrice: raw.yesPrice,
      noPrice: raw.noPrice,
      volume: raw.volume,
      liquidity: raw.liquidity,
      endDate: raw.endDate,
      lastChange24h: raw.lastChange24h,
      tags: raw.tags,
      exchanges: [
        {
          name: 'Kalshi',
          url: this.addUTMParams(`https://kalshi.com/markets/${raw.id}`, 'kalshi'),
          oddsYes: raw.yesPrice,
          oddsNo: raw.noPrice,
          icon: 'https://kalshi.com/favicon.ico',
        },
      ],
    };
  }

  private normalizeToRaw = (market: KalshiMarket): RawMarket => ({
    id: market.id,
    question: market.title,
    yesPrice: market.yes_bid,
    noPrice: market.no_bid,
    volume: market.volume,
    liquidity: market.open_interest,
    endDate: market.close_time,
    lastChange24h: market.price_change_24h,
    tags: [market.category, ...(market.tags || [])],
    metadata: {
      description: market.description,
    },
  });
}
