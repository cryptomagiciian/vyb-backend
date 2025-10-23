import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Connector, ConnectorConfig, ConnectorHealth, ConnectorMetrics, ConnectorError } from './types';

@Injectable()
export abstract class BaseConnector implements Connector {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly httpClient: AxiosInstance;
  protected metrics: ConnectorMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatency: 0,
    lastUpdated: new Date(),
  };

  abstract readonly name: 'polymarket' | 'kalshi';
  abstract readonly config: ConnectorConfig;

  constructor(protected configService: ConfigService) {
    // Initialize HTTP client after config is set by subclasses
  }

  protected initializeHttpClient() {
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'VYB-Backend/1.0.0',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for logging and rate limiting
    this.httpClient.interceptors.request.use(
      (config) => {
        this.metrics.totalRequests++;
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      },
    );

    // Response interceptor for metrics and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.metrics.successfulRequests++;
        this.updateLatencyMetrics(response.config.metadata?.startTime);
        return response;
      },
      async (error: AxiosError) => {
        this.metrics.failedRequests++;
        this.updateLatencyMetrics(error.config?.metadata?.startTime);
        
        const connectorError = this.handleError(error);
        
        // Retry logic for retryable errors
        if (connectorError.retryable && this.shouldRetry(error)) {
          return this.retryRequest(error.config);
        }
        
        return Promise.reject(connectorError);
      },
    );
  }

  private updateLatencyMetrics(startTime?: number) {
    if (startTime) {
      const latency = Date.now() - startTime;
      this.metrics.averageLatency = 
        (this.metrics.averageLatency * (this.metrics.totalRequests - 1) + latency) / 
        this.metrics.totalRequests;
    }
    this.metrics.lastUpdated = new Date();
  }

  private handleError(error: AxiosError): ConnectorError {
    const connectorError = error as ConnectorError;
    
    if (error.response) {
      // Server responded with error status
      connectorError.statusCode = error.response.status;
      connectorError.retryable = this.isRetryableStatus(error.response.status);
      
      switch (error.response.status) {
        case 429:
          connectorError.message = 'Rate limit exceeded';
          connectorError.code = 'RATE_LIMIT';
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          connectorError.message = 'Server error';
          connectorError.code = 'SERVER_ERROR';
          break;
        case 401:
          connectorError.message = 'Authentication failed';
          connectorError.code = 'AUTH_ERROR';
          connectorError.retryable = false;
          break;
        case 403:
          connectorError.message = 'Access forbidden';
          connectorError.code = 'FORBIDDEN';
          connectorError.retryable = false;
          break;
        default:
          connectorError.message = `HTTP ${error.response.status}`;
          connectorError.code = 'HTTP_ERROR';
      }
    } else if (error.request) {
      // Network error
      connectorError.message = 'Network error';
      connectorError.code = 'NETWORK_ERROR';
      connectorError.retryable = true;
    } else {
      // Other error
      connectorError.message = error.message;
      connectorError.code = 'UNKNOWN_ERROR';
      connectorError.retryable = false;
    }

    return connectorError;
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429;
  }

  private shouldRetry(error: AxiosError): boolean {
    const retryCount = error.config?.metadata?.retryCount || 0;
    return retryCount < this.config.retry.maxRetries;
  }

  private async retryRequest(config: any): Promise<any> {
    const retryCount = config.metadata?.retryCount || 0;
    const delay = this.config.retry.backoffMs * Math.pow(2, retryCount);
    
    this.logger.warn(
      `Retrying request to ${config.url} (attempt ${retryCount + 1}/${this.config.retry.maxRetries}) after ${delay}ms`,
    );
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    config.metadata = {
      ...config.metadata,
      retryCount: retryCount + 1,
      startTime: Date.now(),
    };
    
    return this.httpClient.request(config);
  }

  async getHealth(): Promise<ConnectorHealth> {
    try {
      const startTime = Date.now();
      await this.httpClient.get('/health', { timeout: 5000 });
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        lastSuccess: new Date(),
        latency,
        errorCount: this.metrics.failedRequests,
      };
    } catch (error) {
      return {
        status: 'down',
        lastError: error.message,
        errorCount: this.metrics.failedRequests,
      };
    }
  }

  async getMetrics(): Promise<ConnectorMetrics> {
    return { ...this.metrics };
  }

  protected addUTMParams(url: string, source: string): string {
    const urlObj = new URL(url);
    urlObj.searchParams.set('utm_source', 'vyb');
    urlObj.searchParams.set('utm_medium', 'app');
    urlObj.searchParams.set('utm_campaign', 'discovery');
    urlObj.searchParams.set('ref', source);
    return urlObj.toString();
  }
}
