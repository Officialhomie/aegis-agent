/**
 * Zod validation schemas for API request bodies.
 * Blocks LIVE executionMode from external requests.
 */

import { z } from 'zod';

export const AgentCycleRequestSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.75),
  maxTransactionValueUsd: z.number().min(0).optional().default(10000),
  // NEVER allow LIVE mode from external requests without explicit authorization
  executionMode: z.enum(['SIMULATION', 'READONLY']).optional().default('SIMULATION'),
});

export const ReactiveEventSchema = z.object({
  chainId: z.number().int().positive(),
  event: z.string().min(1),
  data: z.unknown(),
});

export type AgentCycleRequest = z.infer<typeof AgentCycleRequestSchema>;
export type ReactiveEvent = z.infer<typeof ReactiveEventSchema>;
