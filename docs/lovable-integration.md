# Lovable Frontend Integration Guide

## 🚀 Quick Start

### 1. Start Your Backend
```bash
# Start the backend services
docker-compose -f docker-compose.dev.yml up -d

# Run database migrations and seed data
npm run db:migrate
npm run db:seed

# Start the API server
npm run start:dev
```

### 2. Test Integration
```bash
# Run integration tests to verify everything works
npm run test:integration
```

### 3. Configure Your Lovable Frontend

#### Environment Variables
Add these to your Lovable project settings:

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080
VITE_APP_NAME=VYB
```

#### API Client Setup
Create an API client in your Lovable frontend:

```typescript
// api/client.ts
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh or redirect to login
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

#### WebSocket Client Setup
```typescript
// api/websocket.ts
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080';

export class WebSocketClient {
  private socket: Socket | null = null;

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(`${WS_URL}/realtime`, {
        auth: { token: `Bearer ${token}` },
      });

      this.socket.on('connect', () => {
        console.log('Connected to VYB realtime');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
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

  disconnect() {
    this.socket?.disconnect();
  }
}
```

## 🔐 Authentication Flow

### Magic Link Authentication
```typescript
// auth/magic-link.ts
export const requestMagicLink = async (email: string) => {
  const response = await apiClient.post('/auth/magic-link', { email });
  return response.data;
};

export const verifyMagicLink = async (token: string) => {
  const response = await apiClient.post('/auth/magic-link/verify', { token });
  
  if (response.data.success) {
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
  }
  
  return response.data;
};
```

### Wallet Authentication
```typescript
// auth/wallet.ts
export const generateWalletChallenge = async (wallet: string) => {
  const response = await apiClient.post('/auth/wallet/challenge', { wallet });
  return response.data;
};

export const verifyWalletSignature = async (wallet: string, signature: string, message: string) => {
  const response = await apiClient.post('/auth/wallet/verify', {
    wallet,
    signature,
    message,
  });
  
  if (response.data.success) {
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
  }
  
  return response.data;
};
```

## 📱 Feed Integration

### Get Market Feed
```typescript
// feed/api.ts
export const getFeed = async (cursor?: string, limit = 5, segment = 'default') => {
  const params = new URLSearchParams();
  if (cursor) params.append('cursor', cursor);
  params.append('limit', limit.toString());
  params.append('segment', segment);

  const response = await apiClient.get(`/feed/next?${params}`);
  return response.data;
};

export const getMarket = async (marketId: string) => {
  const response = await apiClient.get(`/feed/market/${marketId}`);
  return response.data;
};
```

### Real-time Feed Updates
```typescript
// feed/realtime.ts
import { WebSocketClient } from '../api/websocket';

export const setupRealtimeFeed = (onNewMarket: (market: any) => void) => {
  const wsClient = new WebSocketClient();
  
  wsClient.onMarketNew((data) => {
    onNewMarket(data.market);
  });
  
  wsClient.onMarketUpdate((data) => {
    // Handle market updates
    console.log('Market updated:', data.market);
  });
  
  return wsClient;
};
```

## 👆 Swipe Integration

### Record Swipe
```typescript
// swipe/api.ts
export const recordSwipe = async (marketId: string, direction: 'LEFT' | 'RIGHT') => {
  const response = await apiClient.post('/swipe', {
    marketId,
    direction,
    idempotencyKey: `swipe-${marketId}-${Date.now()}`,
  });
  return response.data;
};

export const getSwipeHistory = async (limit = 50, cursor?: string) => {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);

  const response = await apiClient.get(`/swipe/history?${params}`);
  return response.data;
};
```

## 👤 User Profile Integration

### User Management
```typescript
// user/api.ts
export const getUserProfile = async () => {
  const response = await apiClient.get('/user/profile');
  return response.data;
};

export const updateUserProfile = async (updates: {
  handle?: string;
  avatarUrl?: string;
  region?: string;
}) => {
  const response = await apiClient.put('/user/profile', updates);
  return response.data;
};

export const getUserStats = async () => {
  const response = await apiClient.get('/user/stats');
  return response.data;
};
```

## 🎯 Common Patterns

### Error Handling
```typescript
// utils/error-handling.ts
export const handleApiError = (error: any) => {
  if (error.response?.status === 401) {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.response?.status === 429) {
    // Show rate limit message
    return 'Too many requests. Please try again later.';
  } else if (error.response?.data?.message) {
    return error.response.data.message;
  } else {
    return 'An unexpected error occurred.';
  }
};
```

### Loading States
```typescript
// hooks/useApi.ts
import { useState, useEffect } from 'react';

export const useApi = <T>(apiCall: () => Promise<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await apiCall();
        setData(result);
        setError(null);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
};
```

## 🧪 Testing Your Integration

### 1. Run Backend Tests
```bash
npm run test:integration
```

### 2. Test in Browser
1. Open your Lovable frontend
2. Open browser dev tools
3. Check Network tab for API calls
4. Verify WebSocket connection in Console

### 3. Common Issues & Solutions

#### CORS Errors
- Ensure your Lovable domain is in the CORS allowlist
- Check that credentials are enabled

#### Authentication Issues
- Verify JWT token is being sent in Authorization header
- Check token expiration and refresh logic

#### WebSocket Connection Issues
- Ensure WebSocket URL is correct
- Check that auth token is being passed correctly

## 🚀 Production Deployment

### Backend Deployment
1. Deploy your backend to your production environment
2. Update CORS origins to include your production domain
3. Set up SSL certificates
4. Configure environment variables

### Frontend Configuration
```env
VITE_API_URL=https://api.vyb.app
VITE_WS_URL=https://api.vyb.app
```

### Health Monitoring
- Monitor API health at `/health`
- Set up alerts for error rates
- Track response times and throughput

## 📞 Support

If you encounter issues:
1. Check the integration test results
2. Review the API documentation at `/docs`
3. Check backend logs for errors
4. Verify environment variables are set correctly
