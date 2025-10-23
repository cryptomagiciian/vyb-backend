import { z } from 'zod';

export const FeedRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
  segment: z.string().default('default'),
});

export const MarketItemSchema = z.object({
  id: z.string(),
  source: z.enum(['POLYMARKET', 'KALSHI']),
  externalId: z.string(),
  question: z.string(),
  yesPrice: z.number(),
  noPrice: z.number(),
  volume: z.number(),
  liquidity: z.number().optional(),
  endDate: z.string().datetime(),
  lastChange24h: z.number().optional(),
  trendScore: z.number(),
  confidence: z.number(),
  insight: z.string().optional(),
  tags: z.array(z.string()),
  exchanges: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    oddsYes: z.number().optional(),
    oddsNo: z.number().optional(),
    icon: z.string().optional(),
  })),
  outcome: z.enum(['YES', 'NO', 'UNKNOWN']),
  eligible: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const FeedResponseSchema = z.object({
  items: z.array(MarketItemSchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});

export const SwipeRequestSchema = z.object({
  marketId: z.string().min(1, 'Market ID is required'),
  direction: z.enum(['LEFT', 'RIGHT'], {
    errorMap: () => ({ message: 'Direction must be LEFT or RIGHT' }),
  }),
  idempotencyKey: z.string().optional(),
});

export const SwipeResponseSchema = z.object({
  success: z.boolean(),
  xpGained: z.number(),
  streak: z.number(),
  bestStreak: z.number(),
});

export type FeedRequestDto = z.infer<typeof FeedRequestSchema>;
export type MarketItemDto = z.infer<typeof MarketItemSchema>;
export type FeedResponseDto = z.infer<typeof FeedResponseSchema>;
export type SwipeRequestDto = z.infer<typeof SwipeRequestSchema>;
export type SwipeResponseDto = z.infer<typeof SwipeResponseSchema>;
