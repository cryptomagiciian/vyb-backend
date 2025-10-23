import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseConnector } from './base.connector';
import { RawMarket, NormalizedMarket, ConnectorConfig } from './types';

interface PolymarketMarket {
  id: string;
  question: string;
  outcome_prices: {
    'Yes': number;
    'No': number;
  };
  volume: number;
  liquidity: number;
  end_date_iso: string;
  price_change_24h: number;
  tags: string[];
  market_maker: string;
  description: string;
}

interface PolymarketResponse {
  markets: PolymarketMarket[];
  cursor?: string;
}

@Injectable()
export class PolymarketConnector extends BaseConnector {
  readonly name = 'polymarket' as const;
  readonly config: ConnectorConfig = {
    apiUrl: this.configService.get('POLYMARKET_API_URL', 'https://api.polymarket.com'),
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
    try {
      const queryParams = new URLSearchParams({
        limit: '100',
        active: 'true',
        ...(params.since && { since: params.since.toISOString() }),
      });

      const response = await this.httpClient.get<PolymarketResponse>(
        `/markets?${queryParams}`,
      );

      return response.data.markets.map(this.normalizeToRaw);
    } catch (error) {
      this.logger.error('Failed to fetch Polymarket data:', error);
      throw error;
    }
  }

  normalize(raw: RawMarket): NormalizedMarket {
    return {
      source: 'polymarket',
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
          name: 'Polymarket',
          url: this.addUTMParams(`https://polymarket.com/market/${raw.id}`, 'polymarket'),
          oddsYes: raw.yesPrice,
          oddsNo: raw.noPrice,
          icon: 'https://polymarket.com/favicon.ico',
        },
      ],
    };
  }

  private normalizeToRaw = (market: PolymarketMarket): RawMarket => ({
    id: market.id,
    question: market.question,
    yesPrice: market.outcome_prices.Yes,
    noPrice: market.outcome_prices.No,
    volume: market.volume,
    liquidity: market.liquidity,
    endDate: market.end_date_iso,
    lastChange24h: market.price_change_24h,
    tags: market.tags || [],
    metadata: {
      marketMaker: market.market_maker,
      description: market.description,
    },
  });
}
