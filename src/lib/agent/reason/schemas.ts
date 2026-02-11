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
  'WAIT',                // Wait and observe more
  'ALERT_HUMAN',         // Request human intervention
  'SPONSOR_TRANSACTION', // Sponsor user's next tx via Base paymaster
  'SWAP_RESERVES',       // Auto-swap USDC→ETH for agent reserves
  'ALERT_PROTOCOL',      // Notify protocol of low budget
  // Reserve Pipeline (supply side)
  'REPLENISH_RESERVES',  // Convert USDC→ETH when reserves below target
  'ALLOCATE_BUDGET',     // Assign x402 payment to protocol budget
  'ALERT_LOW_RUNWAY',    // Alert when runway below threshold
  'REBALANCE_RESERVES',  // Maintain target ETH/USDC ratio
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

/** Parameters for SPONSOR_TRANSACTION (Base paymaster) - sponsors autonomous agent execution */
export const SponsorParams = z.object({
  agentWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  protocolId: z.string().min(1),
  maxGasLimit: z.number().int().positive().optional().default(200000),
  estimatedCostUSD: z.number().min(0),
  targetContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  // Delegation reference (optional - enables user delegation flow)
  delegationId: z.string().optional(),
  delegatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
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

/** Parameters for REPLENISH_RESERVES (Reserve Pipeline) */
export const ReplenishParams = z.object({
  tokenIn: z.literal('USDC'),
  tokenOut: z.literal('ETH'),
  amountIn: z.string(),
  slippageTolerance: z.number().min(0).max(0.05).default(0.01),
  reason: z.enum(['below_target', 'high_burn_rate', 'scheduled']),
});
export type ReplenishParams = z.infer<typeof ReplenishParams>;

/** Parameters for ALLOCATE_BUDGET (Reserve Pipeline) */
export const AllocateBudgetParams = z.object({
  protocolId: z.string().min(1),
  paymentHash: z.string(),
  amountUSD: z.number().min(0),
  currency: z.string(),
});
export type AllocateBudgetParams = z.infer<typeof AllocateBudgetParams>;

/** Parameters for ALERT_LOW_RUNWAY (Reserve Pipeline) - coerce strings from LLM */
export const AlertRunwayParams = z.object({
  currentRunwayDays: z.coerce.number().min(0),
  thresholdDays: z.coerce.number().min(0),
  ethBalance: z.coerce.number().min(0),
  dailyBurnRate: z.coerce.number().min(0),
  severity: z.enum(['MEDIUM', 'HIGH', 'CRITICAL']),
  suggestedAction: z.string(),
});
export type AlertRunwayParams = z.infer<typeof AlertRunwayParams>;

/** Parameters for REBALANCE_RESERVES (Reserve Pipeline) */
export const RebalanceReservesParams = z.object({
  currentETH: z.number(),
  currentUSDC: z.number(),
  targetRatioETH: z.number().min(0).max(1).default(0.7),
  swapAmount: z.string(),
  swapDirection: z.enum(['USDC_TO_ETH', 'ETH_TO_USDC']),
});
export type RebalanceReservesParams = z.infer<typeof RebalanceReservesParams>;

/** Optional metadata (e.g. reasoningFailed when LLM/reasoning threw; skippedReasoning when observation filter skipped LLM; template when template response used; template-specific fields for logging) */
export const DecisionMetadata = z
  .object({
    reasoningFailed: z.boolean().optional(),
    error: z.string().optional(),
    skippedReasoning: z.boolean().optional(),
    reason: z.string().optional(),
    template: z.string().optional(),
    // Template-response context (for logging/debugging)
    gasPrice: z.number().optional(),
    threshold: z.number().optional(),
    lowGasWalletsCount: z.number().optional(),
    ethBalance: z.number().optional(),
    usdcBalance: z.number().optional(),
    swapAmount: z.number().optional(),
    agentWallet: z.string().optional(),
    protocolId: z.string().optional(),
  })
  .optional();

/** Base fields shared by all decisions - optional defaults when LLM omits fields */
const DecisionBase = z.object({
  confidence: z.number().min(0).max(1).optional().default(0),
  reasoning: z.string().min(10).optional().default('No action required at this time.'),
  preconditions: z.array(z.string()).optional(),
  expectedOutcome: z.string().optional(),
  metadata: DecisionMetadata,
});

/** Discriminated union: action determines required parameters type (LLM output only; EXECUTE/SWAP/TRANSFER/REBALANCE removed) */
export const DecisionSchema = z.discriminatedUnion('action', [
  DecisionBase.extend({ action: z.literal('WAIT'), parameters: z.null().optional().default(null) }),
  DecisionBase.extend({ action: z.literal('ALERT_HUMAN'), parameters: AlertParams }),
  DecisionBase.extend({ action: z.literal('SPONSOR_TRANSACTION'), parameters: SponsorParams }),
  DecisionBase.extend({ action: z.literal('SWAP_RESERVES'), parameters: SwapReservesParams }),
  DecisionBase.extend({ action: z.literal('ALERT_PROTOCOL'), parameters: AlertProtocolParams }),
  DecisionBase.extend({ action: z.literal('REPLENISH_RESERVES'), parameters: ReplenishParams }),
  DecisionBase.extend({ action: z.literal('ALLOCATE_BUDGET'), parameters: AllocateBudgetParams }),
  DecisionBase.extend({ action: z.literal('ALERT_LOW_RUNWAY'), parameters: AlertRunwayParams }),
  DecisionBase.extend({ action: z.literal('REBALANCE_RESERVES'), parameters: RebalanceReservesParams }),
]);

export type Decision = z.infer<typeof DecisionSchema>;

/** Base fields required for any decision (LLM or internal) */
type DecisionBaseFields = {
  confidence: number;
  reasoning: string;
  preconditions?: string[];
  expectedOutcome?: string;
  metadata?: z.infer<typeof DecisionMetadata>;
};

/**
 * Internal execution actions (used by reserve-manager/agentkit only; not emitted by LLM).
 * Union with Decision for executeWithAgentKit and execution layer.
 */
export type ExecutableDecision =
  | Decision
  | ({ action: 'SWAP' | 'REBALANCE'; parameters: SwapParams } & DecisionBaseFields)
  | ({ action: 'TRANSFER'; parameters: TransferParams } & DecisionBaseFields)
  | ({ action: 'EXECUTE'; parameters: ExecuteParams } & DecisionBaseFields);

export const LLMResponseSchema = z.object({
  thinking: z.string().optional(),
  decision: DecisionSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
