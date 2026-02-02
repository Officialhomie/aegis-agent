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
  'EXECUTE',             // Execute an on-chain transaction
  'WAIT',                // Wait and observe more
  'ALERT_HUMAN',         // Request human intervention
  'REBALANCE',           // Treasury rebalancing action
  'SWAP',                // Token swap action
  'TRANSFER',            // Token transfer action
  'SPONSOR_TRANSACTION', // Sponsor user's next tx via Base paymaster
  'SWAP_RESERVES',       // Auto-swap USDC→ETH for agent reserves
  'ALERT_PROTOCOL',      // Notify protocol of low budget
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
export type ExecuteParams = z.infer<typeof ExecuteParams>;

export const SwapParams = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  minAmountOut: z.string().optional(),
  slippageTolerance: z.number().min(0).max(1).optional(),
});
export type SwapParams = z.infer<typeof SwapParams>;

export const TransferParams = z.object({
  token: z.string(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string(),
});
export type TransferParams = z.infer<typeof TransferParams>;

export const AlertParams = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  message: z.string(),
  suggestedAction: z.string().optional(),
});
export type AlertParams = z.infer<typeof AlertParams>;

/** Parameters for SPONSOR_TRANSACTION (Base paymaster) */
export const SponsorParams = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  protocolId: z.string().min(1),
  maxGasLimit: z.number().int().positive().optional().default(200000),
  estimatedCostUSD: z.number().min(0),
});
export type SponsorParams = z.infer<typeof SponsorParams>;

/** Parameters for SWAP_RESERVES (USDC→ETH for agent reserves) */
export const SwapReservesParams = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  minAmountOut: z.string().optional(),
  slippageTolerance: z.number().min(0).max(1).optional(),
});
export type SwapReservesParams = z.infer<typeof SwapReservesParams>;

/** Parameters for ALERT_PROTOCOL (low budget notification) */
export const AlertProtocolParams = z.object({
  protocolId: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('HIGH'),
  budgetRemaining: z.number().min(0),
  estimatedDaysRemaining: z.number().min(0).optional(),
  topUpRecommendation: z.number().min(0).optional(),
});
export type AlertProtocolParams = z.infer<typeof AlertProtocolParams>;

/** Base fields shared by all decisions */
const DecisionBase = z.object({
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10),
  preconditions: z.array(z.string()).optional(),
  expectedOutcome: z.string().optional(),
});

/** Discriminated union: action determines required parameters type */
export const DecisionSchema = z.discriminatedUnion('action', [
  DecisionBase.extend({ action: z.literal('EXECUTE'), parameters: ExecuteParams }),
  DecisionBase.extend({ action: z.literal('WAIT'), parameters: z.null() }),
  DecisionBase.extend({ action: z.literal('ALERT_HUMAN'), parameters: AlertParams }),
  DecisionBase.extend({ action: z.literal('REBALANCE'), parameters: SwapParams }),
  DecisionBase.extend({ action: z.literal('SWAP'), parameters: SwapParams }),
  DecisionBase.extend({ action: z.literal('TRANSFER'), parameters: TransferParams }),
  DecisionBase.extend({ action: z.literal('SPONSOR_TRANSACTION'), parameters: SponsorParams }),
  DecisionBase.extend({ action: z.literal('SWAP_RESERVES'), parameters: SwapReservesParams }),
  DecisionBase.extend({ action: z.literal('ALERT_PROTOCOL'), parameters: AlertProtocolParams }),
]);

export type Decision = z.infer<typeof DecisionSchema>;

/**
 * Schema for LLM response wrapper (includes reasoning before decision)
 */
export const LLMResponseSchema = z.object({
  thinking: z.string().optional(),
  decision: DecisionSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
