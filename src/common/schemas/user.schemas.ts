import { z } from 'zod';

export const UserProfileSchema = z.object({
  id: z.string(),
  handle: z.string(),
  email: z.string().email().optional(),
  wallet: z.string().optional(),
  role: z.enum(['USER', 'ADMIN']),
  avatarUrl: z.string().url().optional(),
  region: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UserStatsSchema = z.object({
  userId: z.string(),
  xp: z.number(),
  streak: z.number(),
  bestStreak: z.number(),
  accuracy: z.number(),
  lastActiveAt: z.string().datetime().optional(),
});

export const UserUpdateSchema = z.object({
  handle: z.string().min(3).max(30).optional(),
  avatarUrl: z.string().url().optional(),
  region: z.string().optional(),
});

export const UserHistoryRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const SwipeHistorySchema = z.object({
  id: z.string(),
  marketId: z.string(),
  direction: z.enum(['LEFT', 'RIGHT']),
  createdAt: z.string().datetime(),
  market: z.object({
    id: z.string(),
    question: z.string(),
    source: z.enum(['POLYMARKET', 'KALSHI']),
    outcome: z.enum(['YES', 'NO', 'UNKNOWN']),
  }),
});

export const UserHistoryResponseSchema = z.object({
  swipes: z.array(SwipeHistorySchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});

export type UserProfileDto = z.infer<typeof UserProfileSchema>;
export type UserStatsDto = z.infer<typeof UserStatsSchema>;
export type UserUpdateDto = z.infer<typeof UserUpdateSchema>;
export type UserHistoryRequestDto = z.infer<typeof UserHistoryRequestSchema>;
export type SwipeHistoryDto = z.infer<typeof SwipeHistorySchema>;
export type UserHistoryResponseDto = z.infer<typeof UserHistoryResponseSchema>;
