import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// MarketItem DTO Schema
export const MarketItemSchema = z.object({
  id: z.string().cuid(),
  source: z.enum(['POLYMARKET', 'KALSHI']),
  question: z.string().min(1).max(500),
  yesPrice: z.number().min(0).max(1),
  noPrice: z.number().min(0).max(1),
  endDate: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  trendScore: z.number().min(0).max(1),
  tags: z.array(z.string()),
  insight: z.string().optional(),
  exchanges: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
  })),
});

// Feed Request DTO Schema
export const FeedRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
  tags: z.array(z.string()).optional(),
});

// Feed Response DTO Schema
export const FeedResponseSchema = z.object({
  items: z.array(MarketItemSchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});

// Swipe Request DTO Schema
export const SwipeRequestSchema = z.object({
  idempotencyKey: z.string().optional(), // Idempotency key
  marketId: z.string().cuid(),
  direction: z.enum(['LEFT', 'RIGHT']),
  swipeToken: z.string().optional(), // Anti-replay token
});

// Swipe Response DTO Schema
export const SwipeResponseSchema = z.object({
  success: z.boolean(),
  xpGained: z.number(),
  currentStreak: z.number(),
  bestStreak: z.number(),
  totalSwipes: z.number(),
});

// User Profile DTO Schema
export const UserProfileSchema = z.object({
  id: z.string().cuid(),
  handle: z.string().min(3).max(30),
  email: z.string().email().optional(),
  wallet: z.string().optional(),
  region: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// User Stats DTO Schema
export const UserStatsSchema = z.object({
  userId: z.string().cuid(),
  totalSwipes: z.number().int().min(0),
  rightSwipes: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  xp: z.number().int().min(0),
  accuracy: z.number().min(0).max(1),
});

// Magic Link Request DTO Schema
export const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
});

// Magic Link Verify DTO Schema
export const MagicLinkVerifySchema = z.object({
  token: z.string().min(1),
});

// Wallet Challenge DTO Schema
export const WalletChallengeSchema = z.object({
  wallet: z.string().min(1),
});

// Wallet Verify DTO Schema
export const WalletVerifySchema = z.object({
  wallet: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
});

// Auth Response DTO Schema
export const AuthResponseSchema = z.object({
  success: z.boolean(),
  user: UserProfileSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

// Create DTO classes
export class MarketItemDto extends createZodDto(MarketItemSchema) {}
export class FeedRequestDto extends createZodDto(FeedRequestSchema) {}
export class FeedResponseDto extends createZodDto(FeedResponseSchema) {}
export class SwipeRequestDto extends createZodDto(SwipeRequestSchema) {}
export class SwipeResponseDto extends createZodDto(SwipeResponseSchema) {}
export class UserProfileDto extends createZodDto(UserProfileSchema) {}
export class UserStatsDto extends createZodDto(UserStatsSchema) {}
export class MagicLinkRequestDto extends createZodDto(MagicLinkRequestSchema) {}
export class MagicLinkVerifyDto extends createZodDto(MagicLinkVerifySchema) {}
export class WalletChallengeDto extends createZodDto(WalletChallengeSchema) {}
export class WalletVerifyDto extends createZodDto(WalletVerifySchema) {}
export class AuthResponseDto extends createZodDto(AuthResponseSchema) {}

// Type exports for TypeScript
export type MarketItem = z.infer<typeof MarketItemSchema>;
export type FeedRequest = z.infer<typeof FeedRequestSchema>;
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
export type SwipeRequest = z.infer<typeof SwipeRequestSchema>;
export type SwipeResponse = z.infer<typeof SwipeResponseSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;
export type MagicLinkVerify = z.infer<typeof MagicLinkVerifySchema>;
export type WalletChallenge = z.infer<typeof WalletChallengeSchema>;
export type WalletVerify = z.infer<typeof WalletVerifySchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
