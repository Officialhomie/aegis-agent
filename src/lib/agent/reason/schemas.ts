/**
 * Aegis Agent - Decision Schemas
 * 
 * Zod schemas for validating LLM outputs and ensuring type safety.
 * These schemas define the structure of agent decisions.
 */

import { z } from 'zod';

/**
 * Available actions the agent can take
 */
export const ActionType = z.enum([
  'EXECUTE',      // Execute an on-chain transaction
  'WAIT',         // Wait and observe more
  'ALERT_HUMAN',  // Request human intervention
  'REBALANCE',    // Treasury rebalancing action
  'SWAP',         // Token swap action
  'TRANSFER',     // Token transfer action
]);

export type ActionType = z.infer<typeof ActionType>;

/**
 * Parameters for different action types
 */
export const ExecuteParams = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  functionName: z.string(),
  args: z.array(z.unknown()).optional(),
  value: z.string().optional(), // Wei value as string
});

export const SwapParams = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  minAmountOut: z.string().optional(),
  slippageTolerance: z.number().min(0).max(1).optional(),
});

export const TransferParams = z.object({
  token: z.string(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string(),
});

export const AlertParams = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  message: z.string(),
  suggestedAction: z.string().optional(),
});

/**
 * Main Decision schema - what the LLM must produce
 */
export const DecisionSchema = z.object({
  // The chosen action
  action: ActionType,
  
  // Confidence score (0.0 to 1.0)
  confidence: z.number().min(0).max(1),
  
  // Explanation of the reasoning
  reasoning: z.string().min(10),
  
  // Action-specific parameters (null for WAIT)
  parameters: z.union([
    ExecuteParams,
    SwapParams,
    TransferParams,
    AlertParams,
    z.null(),
  ]),
  
  // Optional: conditions that should be met before execution
  preconditions: z.array(z.string()).optional(),
  
  // Optional: expected outcome
  expectedOutcome: z.string().optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;

/**
 * Schema for LLM response wrapper (includes reasoning before decision)
 */
export const LLMResponseSchema = z.object({
  thinking: z.string().optional(),
  decision: DecisionSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
