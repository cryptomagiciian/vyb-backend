# Frontend-Backend Integration Guide

## API Endpoints for Lovable Frontend

### Authentication Endpoints
```typescript
// Magic Link Authentication
POST /auth/magic-link
Body: { email: string }
Response: { success: boolean, message: string }

POST /auth/magic-link/verify
Body: { token: string }
Response: { 
  success: boolean,
  user: UserProfile,
  accessToken: string,
  refreshToken: string
}

// Wallet Authentication
POST /auth/wallet/challenge
Body: { wallet: string }
Response: { message: string, nonce: string }

POST /auth/wallet/verify
Body: { wallet: string, signature: string, message: string }
Response: { 
  success: boolean,
  user: UserProfile,
  accessToken: string,
  refreshToken: string
}

GET /auth/me
Headers: { Authorization: "Bearer <token>" }
Response: { success: boolean, user: UserProfile }
```

### Feed Endpoints
```typescript
// Get market feed
GET /feed/next?cursor=string&limit=number&segment=string
Headers: { Authorization: "Bearer <token>" }
Response: {
  success: boolean,
  items: MarketItem[],
  nextCursor?: string,
  hasMore: boolean
}

// Get specific market
GET /feed/market/:id
Headers: { Authorization: "Bearer <token>" }
Response: { success: boolean, market: MarketItem }
```

### Swipe Endpoints
```typescript
// Record swipe
POST /swipe
Headers: { Authorization: "Bearer <token>" }
Body: { marketId: string, direction: "LEFT" | "RIGHT", idempotencyKey?: string }
Response: {
  success: boolean,
  xpGained: number,
  streak: number,
  bestStreak: number
}

// Get swipe history
GET /swipe/history?limit=number&cursor=string
Headers: { Authorization: "Bearer <token>" }
Response: {
  success: boolean,
  swipes: SwipeHistory[],
  nextCursor?: string,
  hasMore: boolean
}
```

### User Endpoints
```typescript
// Get user profile
GET /user/profile
Headers: { Authorization: "Bearer <token>" }
Response: { success: boolean, profile: UserProfile }

// Update profile
PUT /user/profile
Headers: { Authorization: "Bearer <token>" }
Body: { handle?: string, avatarUrl?: string, region?: string }
Response: { success: boolean, profile: UserProfile }

// Get user stats
GET /user/stats
Headers: { Authorization: "Bearer <token>" }
Response: { success: boolean, stats: UserStats }
```

### Real-time WebSocket
```typescript
// Connect to WebSocket
const socket = io('ws://localhost:8080/realtime', {
  auth: { token: 'Bearer <accessToken>' }
});

// Listen for events
socket.on('market:new', (data) => {
  // Handle new market
});

socket.on('market:update', (data) => {
  // Handle market update
});

socket.on('notification', (data) => {
  // Handle user notification
});
```

## Data Types for Frontend

```typescript
interface UserProfile {
  id: string;
  handle: string;
  email?: string;
  wallet?: string;
  role: 'USER' | 'ADMIN';
  avatarUrl?: string;
  region?: string;
  createdAt: string;
  stats?: UserStats;
}

interface UserStats {
  userId: string;
  xp: number;
  streak: number;
  bestStreak: number;
  accuracy: number;
  lastActiveAt?: string;
}

interface MarketItem {
  id: string;
  source: 'POLYMARKET' | 'KALSHI';
  externalId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity?: number;
  endDate: string;
  lastChange24h?: number;
  trendScore: number;
  confidence: number;
  insight?: string;
  tags: string[];
  exchanges: ExchangeInfo[];
  outcome: 'YES' | 'NO' | 'UNKNOWN';
  eligible: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExchangeInfo {
  name: string;
  url: string;
  oddsYes?: number;
  oddsNo?: number;
  icon?: string;
}

interface SwipeHistory {
  id: string;
  marketId: string;
  direction: 'LEFT' | 'RIGHT';
  createdAt: string;
  market: {
    id: string;
    question: string;
    source: string;
    outcome: string;
  };
}
```
