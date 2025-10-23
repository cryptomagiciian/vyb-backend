# VYB Backend v2.0

🚀 **Real-time, swipe-driven discovery feed for Polymarket & Kalshi markets**

A production-ready NestJS backend that powers the VYB prediction market discovery app with real-time updates, AI insights, and gamified user engagement.

## ✨ Features

- **🎯 Swipe-Driven Feed**: Cursor-based pagination with ranking algorithm
- **⚡ Real-time Updates**: WebSocket gateway with live market broadcasts
- **🔐 Dual Authentication**: Magic link email + ECDSA wallet signature
- **🤖 AI Insights**: OpenAI-powered market summaries (≤140 chars)
- **📊 Gamification**: XP system, streaks, leaderboards
- **🛡️ Production Security**: Rate limiting, CORS, anti-replay protection
- **📈 Observability**: OpenTelemetry tracing, structured logging
- **🔧 Admin Controls**: Feature flags, market spotlighting
- **📱 SDK Generation**: Auto-generated TypeScript SDK

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js 20, TypeScript
- **Framework**: NestJS (modular, providers, guards)
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Queues**: Redis + BullMQ
- **Real-time**: Socket.io (namespaced `/ws`)
- **Auth**: JWT + Magic Link + Wallet Signature (SIWE)
- **Validation**: Zod (DTO pipes)
- **Email**: Resend API
- **AI**: OpenAI GPT-4
- **Deployment**: Railway (1-click deploy)

### Core Modules

```
src/
├── auth/           # Magic link + wallet authentication
├── feed/           # Market feed with cursor pagination
├── swipes/         # Swipe recording with anti-replay
├── users/          # Profiles, stats, leaderboards
├── ranking/        # Multi-factor ranking algorithm
├── realtime/       # WebSocket gateway
├── insights/       # AI-powered market insights
├── vendors/        # Polymarket/Kalshi connectors
├── admin/          # Feature flags, spotlighting
└── common/         # Shared utilities, DTOs, guards
```

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repository>
cd vyb-backend
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup
```bash
# Start services
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 4. Start Development
```bash
npm run start:dev
```

**API Available at**: `http://localhost:8080`

## 📚 API Documentation

- **📖 Swagger UI**: http://localhost:8080/docs
- **🏥 Health Check**: http://localhost:8080/healthz
- **📋 OpenAPI JSON**: http://localhost:8080/docs-json
- **ℹ️ API Metadata**: http://localhost:8080/meta

## 🎯 Key Endpoints

### Authentication
```typescript
POST /auth/magic-link          // Request magic link
POST /auth/magic-link/verify   // Verify magic link
POST /auth/wallet/challenge    // Generate wallet challenge
POST /auth/wallet/verify       // Verify wallet signature
GET  /auth/me                  // Get current user
```

### Feed (Cursor-based Pagination)
```typescript
GET /feed/next?cursor=...&limit=5&tags=...  // Get next markets
GET /feed/market/:id                        // Get specific market
GET /feed/stats                             // Feed statistics
```

### Swipes (Idempotent)
```typescript
POST /swipe                    // Record swipe (anti-replay)
GET  /swipe/history           // User's swipe history
GET  /swipe/streak            // Current streak info
```

### Users & Gamification
```typescript
GET  /user/profile            // User profile
PUT  /user/profile            // Update profile
GET  /user/stats              // XP, streaks, accuracy
GET  /user/leaderboard/global // Global leaderboard
```

### Real-time WebSocket
```typescript
// Connect to: ws://localhost:8080/ws
// Events: market:new, market:update, notification, system:notice
```

## 🧮 Ranking Algorithm

**Multi-factor scoring system** with configurable weights:

```typescript
confidence = w1*liquidityNorm + w2*volNorm + w3*driftNorm + w4*socialNorm + w5*timeDecay
trendScore = 0.5*driftNorm + 0.5*socialNorm
```

**Default Weights**:
- **Liquidity** (28%): Market depth and trading volume
- **Volume** (22%): 24h trading volume  
- **Drift** (16%): Price movement momentum
- **Social** (24%): Social media mentions
- **Time** (10%): Exponential time decay (30d half-life)

## 🔐 Security Features

- **Rate Limiting**: 120 req/min per IP, 30 swipes/min per user
- **Anti-replay**: Signed swipe tokens with expiration
- **Device Fingerprinting**: Additional security layer
- **CORS**: Configurable origins for production
- **Helmet**: Security headers
- **JWT**: Access + refresh token rotation
- **Idempotency**: Prevents duplicate operations

## 📱 Frontend Integration

### Lovable React + Vite SPA
Perfect match for your frontend architecture:

```typescript
// Install SDK
npm install @betfeed/sdk

// Initialize client
import { createVYBClient } from '@betfeed/sdk';

const apiClient = createVYBClient({
  baseURL: 'http://localhost:8080'
});

// Use in your components
const feed = await apiClient.getFeed({ limit: 5 });
const swipe = await apiClient.recordSwipe(marketId, 'RIGHT');
```

**See**: `docs/lovable-frontend-guide.md` for complete integration guide.

## 🚀 Deployment

### Railway (1-Click Deploy)
```bash
# Deploy to Railway
npm run deploy:railway
```

### Manual Railway Setup
1. Connect GitHub repository to Railway
2. Add PostgreSQL and Redis services
3. Set environment variables
4. Deploy automatically on push

### Docker
```bash
# Development
npm run docker:dev

# Production  
npm run docker:prod
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Integration tests
npm run test:integration

# Frontend integration test
open test-frontend.html
```

## 📊 Observability

### Health Monitoring
- **Basic**: `GET /healthz` - Database + Redis connectivity
- **Detailed**: Includes service status and metrics

### Logging
- **Structured**: JSON logs with Pino
- **Levels**: Error, Warn, Log, Debug, Verbose
- **Context**: Request IDs, user IDs, operation tracking

### Tracing
- **OpenTelemetry**: Distributed tracing (optional)
- **Spans**: Database queries, external API calls
- **Metrics**: Custom business metrics

## 🔧 Development

### Database Operations
```bash
npm run db:migrate      # Create migration
npm run db:reset        # Reset database
npm run db:studio       # View data
npm run db:seed         # Seed sample data
```

### Code Quality
```bash
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # TypeScript
```

### SDK Generation
```bash
npm run generate:sdk   # Generate TypeScript SDK
```

## 🌍 Environment Variables

### Required
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-jwt-secret
MAGIC_LINK_SECRET=your-magic-link-secret
```

### Email Service
```env
EMAIL_FROM=noreply@vyb.app
RESEND_API_KEY=re_your-resend-key
```

### External APIs
```env
OPENAI_API_KEY=sk-your-openai-key
NEWSAPI_KEY=your-newsapi-key
X_BEARER_TOKEN=your-twitter-bearer
```

### CORS & Security
```env
CORS_ORIGIN=https://app.yourdomain.com
RATE_LIMIT_IP_PER_MINUTE=120
RATE_LIMIT_USER_SWIPES_PER_MINUTE=30
```

## 📈 Performance

- **Database**: Optimized indexes for ranking queries
- **Caching**: Redis for hot data and rate limiting
- **Pagination**: Cursor-based for consistent performance
- **WebSocket**: Namespaced connections for scalability
- **Rate Limiting**: Redis-backed with sliding windows

## 🔄 Data Flow

1. **Ingestion**: Connectors fetch from Polymarket/Kalshi
2. **Processing**: BullMQ jobs rank and process markets
3. **Storage**: PostgreSQL + Redis caching
4. **API**: REST endpoints with cursor pagination
5. **Real-time**: WebSocket broadcasts to connected clients
6. **Analytics**: User behavior tracking and insights

## 🎯 Perfect for Lovable

Your React + Vite SPA architecture is **perfectly suited** for VYB:

✅ **Client-side routing** - React Router for SPA navigation  
✅ **Real-time updates** - Socket.io client for live feeds  
✅ **State management** - Zustand for game state  
✅ **Data fetching** - TanStack Query for optimistic updates  
✅ **Animations** - Framer Motion for swipe gestures  
✅ **Dark theme** - Neon aesthetic with CSS variables  
✅ **TypeScript** - Full type safety with generated SDK  

## 📞 Support

- **Documentation**: `/docs` endpoint
- **Health Check**: `/healthz` endpoint  
- **Integration Guide**: `docs/lovable-frontend-guide.md`
- **API Reference**: `docs/api-reference.md`

## 📄 License

Private - VYB Team

---

**Built with ❤️ for the prediction market community**