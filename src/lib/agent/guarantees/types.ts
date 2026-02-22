/**
 * Execution Guarantees - Type Definitions
 *
 * SLA-backed gas sponsorship with budget reservation and refunds.
 */

export type GuaranteeType = 'GAS_BUDGET' | 'TX_COUNT' | 'TIME_WINDOW';
export type GuaranteeStatus = 'PENDING' | 'ACTIVE' | 'DEPLETED' | 'EXPIRED' | 'BREACHED' | 'CANCELLED';
export type ServiceTier = 'BRONZE' | 'SILVER' | 'GOLD';
export type BreachType = 'SLA_MISSED' | 'EXECUTION_FAILED' | 'BUDGET_EXCEEDED';
export type RefundStatus = 'PENDING' | 'APPROVED' | 'REFUNDED' | 'REJECTED';

/**
 * Tier configuration with SLA parameters
 */
export interface TierConfig {
  name: ServiceTier;
  premiumRate: number; // 0.0, 0.15, 0.30
  slaTargetPct: number; // 0, 95, 99
  maxLatencyMs: number; // 0, 300000, 120000
  breachPenalty: number; // 0, 50, 100 (refund %)
}

export const TIER_CONFIGS: Record<ServiceTier, TierConfig> = {
  BRONZE: {
    name: 'BRONZE',
    premiumRate: 0,
    slaTargetPct: 0,
    maxLatencyMs: 0, // No SLA
    breachPenalty: 0,
  },
  SILVER: {
    name: 'SILVER',
    premiumRate: 0.15,
    slaTargetPct: 95,
    maxLatencyMs: 5 * 60 * 1000, // 5 minutes
    breachPenalty: 50, // 50% refund
  },
  GOLD: {
    name: 'GOLD',
    premiumRate: 0.30,
    slaTargetPct: 99,
    maxLatencyMs: 2 * 60 * 1000, // 2 minutes
    breachPenalty: 100, // Full refund
  },
};

/**
 * Request to create a new guarantee
 */
export interface CreateGuaranteeRequest {
  type: GuaranteeType;
  beneficiary: string; // Agent wallet address
  protocolId: string;

  // For GAS_BUDGET type
  budgetUsd?: number;

  // For TX_COUNT type
  txCount?: number;
  maxGasPerTx?: bigint;

  // For TIME_WINDOW type (uses tier defaults if not specified)
  maxLatencyMs?: number;
  breachPenalty?: number;

  // Common constraints
  maxGasPrice?: bigint; // Wei
  validFrom: Date;
  validUntil: Date;
  tier: ServiceTier;
}

/**
 * Full guarantee object from database
 */
export interface ExecutionGuarantee {
  id: string;
  type: GuaranteeType;
  beneficiary: string;
  protocolId: string;

  // Budget
  budgetWei: bigint | null;
  budgetUsd: number | null;
  usedWei: bigint;
  usedUsd: number;

  // Transaction count
  txCount: number | null;
  usedTxCount: number;
  maxGasPerTx: bigint | null;

  // SLA
  maxLatencyMs: number | null;
  breachPenalty: number | null;

  // Constraints
  maxGasPrice: bigint | null;
  validFrom: Date;
  validUntil: Date;

  // Financial
  lockedAmountUsd: number;
  premiumPaid: number;
  refundsIssued: number;
  tier: ServiceTier;

  // Status
  status: GuaranteeStatus;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  expiredAt: Date | null;
  breachedAt: Date | null;
}

/**
 * Usage record for a guarantee
 */
export interface GuaranteeUsageRecord {
  id: string;
  guaranteeId: string;
  userOpHash: string;
  txHash: string | null;
  gasUsed: bigint;
  gasPriceWei: bigint;
  costWei: bigint;
  costUsd: number;
  submittedAt: Date;
  includedAt: Date | null;
  latencyMs: number | null;
  slaMet: boolean | null;
  createdAt: Date;
}

/**
 * Breach record
 */
export interface GuaranteeBreachRecord {
  id: string;
  guaranteeId: string;
  usageId: string | null;
  breachType: BreachType;
  breachDetails: Record<string, unknown>;
  refundAmount: number;
  refundStatus: RefundStatus;
  refundedAt: Date | null;
  createdAt: Date;
}

/**
 * Result of creating a guarantee
 */
export interface CreateGuaranteeResult {
  guaranteeId: string;
  status: GuaranteeStatus;
  lockedAmount: number;
  premiumCharged: number;
  effectiveFrom: Date;
  effectiveUntil: Date;
  slaTerms: {
    maxLatencyMs: number;
    breachPenalty: number;
  } | null;
}

/**
 * Guarantee usage summary
 */
export interface GuaranteeUsageSummary {
  total: number;
  used: number;
  remaining: number;
  utilizationPct: number;
}

/**
 * Guarantee SLA summary
 */
export interface GuaranteeSlaSummary {
  totalExecutions: number;
  slaMet: number;
  slaBreached: number;
  complianceRate: number;
}

/**
 * Guarantee financial summary
 */
export interface GuaranteeFinancialSummary {
  lockedAmount: number;
  premiumPaid: number;
  refundsIssued: number;
  netCost: number;
}

/**
 * Full guarantee details for API response
 */
export interface GuaranteeDetails {
  id: string;
  type: GuaranteeType;
  beneficiary: string;
  protocolId: string;
  status: GuaranteeStatus;
  tier: ServiceTier;

  budget: GuaranteeUsageSummary;
  sla: GuaranteeSlaSummary;
  financial: GuaranteeFinancialSummary;

  validity: {
    from: Date;
    until: Date;
    remainingDays: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of cancelling a guarantee
 */
export interface CancelGuaranteeResult {
  cancelled: boolean;
  refundAmount: number;
  cancellationFee: number;
}
