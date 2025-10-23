export interface RawMarket {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity?: number;
  endDate: string; // ISO string
  lastChange24h?: number;
  tags: string[];
  description?: string;
  metadata?: Record<string, any>;
}

export interface NormalizedMarket {
  source: 'polymarket' | 'kalshi' | 'mock';
  externalId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity?: number;
  endDate: string; // ISO string
  lastChange24h?: number;
  tags: string[];
  description?: string;
  exchanges: ExchangeInfo[];
}

export interface ExchangeInfo {
  name: string;
  url: string;
  oddsYes?: number;
  oddsNo?: number;
  icon?: string;
}

export interface ConnectorConfig {
  apiUrl: string;
  apiKey?: string;
  rateLimit: {
    requestsPerMinute: number;
    burstLimit: number;
  };
  retry: {
    maxRetries: number;
    backoffMs: number;
  };
  timeout: number;
}

export interface ConnectorHealth {
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess?: Date;
  lastError?: string;
  errorCount: number;
  latency?: number;
}

export interface ConnectorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  lastUpdated: Date;
}

export abstract class Connector {
  abstract readonly name: 'polymarket' | 'kalshi' | 'mock';
  abstract readonly config: ConnectorConfig;
  
  abstract fetchMarkets(params: { since?: Date }): Promise<RawMarket[]>;
  abstract normalize(raw: RawMarket): NormalizedMarket;
  abstract getHealth(): Promise<ConnectorHealth>;
  abstract getMetrics(): Promise<ConnectorMetrics>;
}

export interface ConnectorError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
}
