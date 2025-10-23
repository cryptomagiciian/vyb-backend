# VYB Frontend Integration Guide for Lovable

## 🎯 Perfect Match: React + Vite SPA Architecture

Your Lovable frontend is perfectly architected for VYB! Here's how to integrate with the backend:

## 🚀 Quick Setup

### 1. Environment Variables in Lovable
```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080
VITE_APP_NAME=VYB
```

### 2. Install Dependencies
```bash
npm install @betfeed/sdk socket.io-client @tanstack/react-query zustand framer-motion
```

## 📱 Core Integration

### API Client Setup
```typescript
// lib/api.ts
import { createVYBClient } from '@betfeed/sdk';

export const apiClient = createVYBClient({
  baseURL: import.meta.env.VITE_API_URL,
}, {
  onAuthError: () => {
    // Redirect to login
    window.location.href = '/login';
  },
  onRateLimit: (retryAfter) => {
    // Show rate limit message
    console.warn(`Rate limited. Retry after ${retryAfter} seconds`);
  }
});
```

### WebSocket Client Setup
```typescript
// lib/websocket.ts
import { io, Socket } from 'socket.io-client';

class WebSocketManager {
  private socket: Socket | null = null;
  private token: string | null = null;

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.token = token;
      this.socket = io(import.meta.env.VITE_WS_URL + '/ws', {
        auth: { token: `Bearer ${token}` }
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
    this.socket = null;
  }
}

export const wsManager = new WebSocketManager();
```

## 🎮 Game State Management (Zustand)

```typescript
// stores/gameStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GameState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  
  // Game state
  currentStreak: number;
  bestStreak: number;
  xp: number;
  level: number;
  
  // Feed state
  currentMarket: Market | null;
  marketHistory: Market[];
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  updateStreak: (streak: number) => void;
  addXP: (amount: number) => void;
  setCurrentMarket: (market: Market | null) => void;
  addToHistory: (market: Market) => void;
  setLoading: (loading: boolean) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      currentStreak: 0,
      bestStreak: 0,
      xp: 0,
      level: 1,
      currentMarket: null,
      marketHistory: [],
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      updateStreak: (streak) => set({ currentStreak: streak }),
      addXP: (amount) => set((state) => ({ 
        xp: state.xp + amount,
        level: Math.floor((state.xp + amount) / 1000) + 1
      })),
      setCurrentMarket: (market) => set({ currentMarket: market }),
      addToHistory: (market) => set((state) => ({ 
        marketHistory: [...state.marketHistory, market] 
      })),
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'vyb-game-state',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        currentStreak: state.currentStreak,
        bestStreak: state.bestStreak,
        xp: state.xp,
        level: state.level,
      }),
    }
  )
);
```

## 🔄 Data Fetching (TanStack Query)

```typescript
// hooks/useFeed.ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';

export const useFeed = () => {
  return useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => apiClient.getFeed({ 
      cursor: pageParam,
      limit: 5 
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
  });
};

export const useMarket = (marketId: string) => {
  return useQuery({
    queryKey: ['market', marketId],
    queryFn: () => apiClient.getMarket(marketId),
    enabled: !!marketId,
  });
};

export const useUserStats = () => {
  return useQuery({
    queryKey: ['userStats'],
    queryFn: () => apiClient.getUserStats(),
    enabled: useGameStore.getState().isAuthenticated,
  });
};
```

## 👆 Swipe Deck Component

```typescript
// components/SwipeDeck.tsx
import { motion, PanInfo } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useFeed } from '../hooks/useFeed';
import { apiClient } from '../lib/api';

export const SwipeDeck = () => {
  const { data: feedData, fetchNextPage } = useFeed();
  const { setCurrentMarket, addToHistory, addXP, updateStreak } = useGameStore();
  
  const currentMarket = useGameStore(state => state.currentMarket);

  const handleSwipe = async (direction: 'LEFT' | 'RIGHT', info: PanInfo) => {
    if (!currentMarket) return;

    try {
      // Record swipe
      const result = await apiClient.recordSwipe(
        currentMarket.id, 
        direction
      );

      // Update game state
      addXP(result.xpGained);
      updateStreak(result.currentStreak);
      addToHistory(currentMarket);

      // Move to next market
      const nextMarket = getNextMarket();
      setCurrentMarket(nextMarket);

    } catch (error) {
      console.error('Swipe failed:', error);
    }
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 100;
    
    if (info.offset.x > threshold) {
      handleSwipe('RIGHT', info);
    } else if (info.offset.x < -threshold) {
      handleSwipe('LEFT', info);
    }
  };

  return (
    <div className="relative w-full h-full">
      {currentMarket && (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900 rounded-2xl p-6"
        >
          <h2 className="text-white text-xl font-bold mb-4">
            {currentMarket.question}
          </h2>
          
          <div className="flex justify-between text-green-400 text-lg">
            <span>YES: {Math.round(currentMarket.yesPrice * 100)}%</span>
            <span>NO: {Math.round(currentMarket.noPrice * 100)}%</span>
          </div>
          
          {currentMarket.insight && (
            <p className="text-gray-300 text-sm mt-4">
              {currentMarket.insight}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
};
```

## 🔥 HUD Components

```typescript
// components/HUD.tsx
import { useGameStore } from '../stores/gameStore';

export const HUD = () => {
  const { currentStreak, bestStreak, xp, level } = useGameStore();

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-between items-center">
      {/* XP Bar */}
      <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
        <div className="flex items-center space-x-2">
          <span className="text-green-400 font-bold">Level {level}</span>
          <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-blue-400 transition-all duration-300"
              style={{ width: `${(xp % 1000) / 10}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streak Flames */}
      <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
        <div className="flex items-center space-x-2">
          <span className="text-orange-400">🔥</span>
          <span className="text-white font-bold">{currentStreak}</span>
          <span className="text-gray-400">/ {bestStreak}</span>
        </div>
      </div>
    </div>
  );
};
```

## 🎰 Bet Modal Component

```typescript
// components/BetModal.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BetModalProps {
  market: Market;
  isOpen: boolean;
  onClose: () => void;
}

export const BetModal = ({ market, isOpen, onClose }: BetModalProps) => {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-900 rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-xl font-bold mb-4">
              Place Your Bet
            </h3>
            
            <p className="text-gray-300 mb-6">
              {market.question}
            </p>

            <div className="space-y-3">
              {market.exchanges.map((exchange) => (
                <button
                  key={exchange.name}
                  onClick={() => {
                    setSelectedExchange(exchange.name);
                    window.open(exchange.url, '_blank');
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-purple-500 hover:to-blue-500 transition-all duration-200"
                >
                  Bet on {exchange.name}
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </AnimatePresence>
  );
};
```

## 🔐 Authentication Flow

```typescript
// components/AuthProvider.tsx
import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { apiClient } from '../lib/api';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { setUser, isAuthenticated } = useGameStore();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      apiClient.setAccessToken(token);
      
      // Verify token and get user
      apiClient.getCurrentUser()
        .then((response) => {
          if (response.success) {
            setUser(response.user);
          }
        })
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('accessToken');
          apiClient.clearTokens();
        });
    }
  }, [setUser]);

  return <>{children}</>;
};
```

## 📊 Real-time Updates

```typescript
// hooks/useRealtime.ts
import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { wsManager } from '../lib/websocket';

export const useRealtime = () => {
  const { isAuthenticated } = useGameStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Connect to WebSocket
    wsManager.connect(token);

    // Set up event listeners
    wsManager.onMarketNew((data) => {
      console.log('New market:', data.market);
      // Handle new market notification
    });

    wsManager.onNotification((notification) => {
      console.log('Notification:', notification);
      // Show notification toast
    });

    return () => {
      wsManager.disconnect();
    };
  }, [isAuthenticated]);
};
```

## 🎨 Dark Neon Theme

```css
/* styles/theme.css */
:root {
  --neon-green: #00ff88;
  --neon-blue: #00ccff;
  --neon-purple: #cc00ff;
  --dark-bg: #0a0a0a;
  --dark-surface: #1a1a1a;
  --dark-border: #333333;
}

body {
  background: var(--dark-bg);
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.neon-glow {
  box-shadow: 0 0 20px var(--neon-green);
}

.gradient-text {
  background: linear-gradient(135deg, var(--neon-green), var(--neon-blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

## 🚀 Deployment

### Railway Deployment
1. Connect your Lovable project to Railway
2. Set environment variables in Railway dashboard
3. Deploy as static site with SPA routing

### Environment Variables for Production
```env
VITE_API_URL=https://your-backend.railway.app
VITE_WS_URL=https://your-backend.railway.app
```

## 🧪 Testing Integration

```typescript
// Test your integration
import { apiClient } from './lib/api';

const testIntegration = async () => {
  try {
    // Test API connection
    const health = await fetch(`${import.meta.env.VITE_API_URL}/healthz`);
    console.log('API Health:', await health.json());

    // Test authentication
    const magicLink = await apiClient.requestMagicLink('test@example.com');
    console.log('Magic Link:', magicLink);

    // Test feed
    const feed = await apiClient.getFeed({ limit: 5 });
    console.log('Feed:', feed);

  } catch (error) {
    console.error('Integration test failed:', error);
  }
};
```

## 🎯 Perfect Match Features

✅ **Framer Motion Gestures** - Smooth swipe animations  
✅ **Socket.io Real-time** - Live market updates  
✅ **TanStack Query** - Optimistic updates & caching  
✅ **Zustand State** - Game state persistence  
✅ **Dark Neon Aesthetic** - TikTok/Tinder vibes  
✅ **HUD Components** - Streak flames, XP bar  
✅ **Bet Modal** - Exchange listings  
✅ **Real-time Banners** - WebSocket notifications  

Your Lovable frontend architecture is perfectly suited for VYB's real-time, interactive nature! The combination of React + Vite + client-side routing provides the optimal user experience for a swipe-driven prediction market app.
