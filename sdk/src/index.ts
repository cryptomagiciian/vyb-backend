import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { io, Socket } from 'socket.io-client';

// Re-export types
export * from '../types';

export interface VYBConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
}

export interface VYBClientOptions {
  config: VYBConfig;
  onAuthError?: () => void;
  onRateLimit?: (retryAfter: number) => void;
}

export class VYBClient {
  private api: AxiosInstance;
  private socket: Socket | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private onAuthError?: () => void;
  private onRateLimit?: (retryAfter: number) => void;

  constructor(options: VYBClientOptions) {
    this.onAuthError = options.onAuthError;
    this.onRateLimit = options.onRateLimit;

    this.api = axios.create({
      baseURL: options.config.baseURL,
      timeout: options.config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(options.config.apiKey && { 'X-API-Key': options.config.apiKey }),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.onAuthError) {
          this.onAuthError();
        } else if (error.response?.status === 429 && this.onRateLimit) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          this.onRateLimit(parseInt(retryAfter));
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async requestMagicLink(email: string) {
    const response = await this.api.post('/auth/magic-link', { email });
    return response.data;
  }

  async verifyMagicLink(token: string) {
    const response = await this.api.post('/auth/magic-link/verify', { token });
    const data = response.data;
    
    if (data.success) {
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
    }
    
    return data;
  }

  async generateWalletChallenge(wallet: string) {
    const response = await this.api.post('/auth/wallet/challenge', { wallet });
    return response.data;
  }

  async verifyWalletSignature(wallet: string, signature: string, message: string) {
    const response = await this.api.post('/auth/wallet/verify', {
      wallet,
      signature,
      message,
    });
    
    const data = response.data;
    if (data.success) {
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
    }
    
    return data;
  }

  async getCurrentUser() {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  // Feed
  async getFeed(options: { cursor?: string; limit?: number; tags?: string[] } = {}) {
    const params = new URLSearchParams();
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.tags) options.tags.forEach(tag => params.append('tags', tag));

    const response = await this.api.get(`/feed/next?${params}`);
    return response.data;
  }

  async getMarket(marketId: string) {
    const response = await this.api.get(`/feed/market/${marketId}`);
    return response.data;
  }

  // Swipes
  async recordSwipe(marketId: string, direction: 'LEFT' | 'RIGHT', swipeToken?: string) {
    const response = await this.api.post('/swipe', {
      marketId,
      direction,
      swipeToken,
    });
    return response.data;
  }

  async getSwipeHistory(options: { limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const response = await this.api.get(`/swipe/history?${params}`);
    return response.data;
  }

  async getCurrentStreak() {
    const response = await this.api.get('/swipe/streak');
    return response.data;
  }

  // Users
  async getUserProfile() {
    const response = await this.api.get('/user/profile');
    return response.data;
  }

  async updateUserProfile(updates: { handle?: string; avatarUrl?: string; region?: string }) {
    const response = await this.api.put('/user/profile', updates);
    return response.data;
  }

  async getUserStats() {
    const response = await this.api.get('/user/stats');
    return response.data;
  }

  async getLeaderboard(type: 'xp' | 'streak' | 'accuracy' = 'xp', limit = 100) {
    const response = await this.api.get(`/user/leaderboard/global?type=${type}&limit=${limit}`);
    return response.data;
  }

  // WebSocket
  connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.accessToken) {
        reject(new Error('No access token available'));
        return;
      }

      this.socket = io(`${this.api.defaults.baseURL}/ws`, {
        auth: { token: `Bearer ${this.accessToken}` },
      });

      this.socket.on('connect', () => {
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        reject(error);
      });
    });
  }

  onMarketNew(callback: (data: any) => void) {
    this.socket?.on('market:new', callback);
  }

  onMarketUpdate(callback: (data: any) => void) {
    this.socket?.on('market:update', callback);
  }

  onNotification(callback: (data: any) => void) {
    this.socket?.on('notification', callback);
  }

  onSystemNotice(callback: (data: any) => void) {
    this.socket?.on('system:notice', callback);
  }

  disconnectWebSocket() {
    this.socket?.disconnect();
    this.socket = null;
  }

  // Utility methods
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  setRefreshToken(token: string) {
    this.refreshToken = token;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

// Factory function for easy initialization
export function createVYBClient(config: VYBConfig, options?: Partial<VYBClientOptions>): VYBClient {
  return new VYBClient({
    config,
    ...options,
  });
}

// Default export
export default VYBClient;
