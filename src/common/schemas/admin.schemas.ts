import { z } from 'zod';

export const FeatureFlagSchema = z.object({
  key: z.string().min(1, 'Feature flag key is required'),
  enabled: z.boolean(),
  payload: z.record(z.any()).optional(),
});

export const FeatureFlagUpdateSchema = z.object({
  enabled: z.boolean(),
  payload: z.record(z.any()).optional(),
});

export const ReindexRequestSchema = z.object({
  segment: z.string().optional(),
  force: z.boolean().default(false),
});

export const ConnectorHealthSchema = z.object({
  connector: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  lastSuccess: z.string().datetime().optional(),
  lastError: z.string().optional(),
  errorCount: z.number(),
  updatedAt: z.string().datetime(),
});

export const AdminHealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string().datetime(),
  connectors: z.array(ConnectorHealthSchema),
  queues: z.object({
    ingestion: z.object({
      waiting: z.number(),
      active: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
    ranking: z.object({
      waiting: z.number(),
      active: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
    insights: z.object({
      waiting: z.number(),
      active: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
  }),
  metrics: z.object({
    feedLatency: z.number(),
    swipeQPS: z.number(),
    activeUsers: z.number(),
    errorRate: z.number(),
  }),
});

export type FeatureFlagDto = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagUpdateDto = z.infer<typeof FeatureFlagUpdateSchema>;
export type ReindexRequestDto = z.infer<typeof ReindexRequestSchema>;
export type ConnectorHealthDto = z.infer<typeof ConnectorHealthSchema>;
export type AdminHealthResponseDto = z.infer<typeof AdminHealthResponseSchema>;
