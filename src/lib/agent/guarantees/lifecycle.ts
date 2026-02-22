/**
 * Execution Guarantees - Lifecycle Management
 *
 * Handles creation, activation, expiration, cancellation, and breach of guarantees.
 */

import { getPrisma } from '../../db';
import { logger } from '../../logger';
import {
  CreateGuaranteeRequest,
  CreateGuaranteeResult,
  CancelGuaranteeResult,
  ExecutionGuarantee,
  GuaranteeDetails,
  GuaranteeStatus,
  ServiceTier,
  TIER_CONFIGS,
} from './types';
import {
  calculatePremium,
  calculateReserveBuffer,
  calculateCancellationRefund,
  calculateExpirationRefund,
  validateProtocolBalance,
} from './pricing';

const db = getPrisma();

/**
 * Create a new execution guarantee
 *
 * Locks funds from protocol balance, charges premium, and creates guarantee record.
 */
export async function createGuarantee(
  request: CreateGuaranteeRequest
): Promise<CreateGuaranteeResult> {
  const {
    type,
    beneficiary,
    protocolId,
    budgetUsd,
    txCount,
    maxGasPerTx,
    maxLatencyMs,
    breachPenalty,
    maxGasPrice,
    validFrom,
    validUntil,
    tier,
  } = request;

  // Validate request
  if (type === 'GAS_BUDGET' && !budgetUsd) {
    throw new Error('budgetUsd is required for GAS_BUDGET type');
  }
  if (type === 'TX_COUNT' && !txCount) {
    throw new Error('txCount is required for TX_COUNT type');
  }

  // Calculate budget for non-GAS_BUDGET types (estimate)
  let effectiveBudgetUsd = budgetUsd ?? 0;
  if (type === 'TX_COUNT' && txCount) {
    // Estimate $0.50 per transaction
    effectiveBudgetUsd = txCount * 0.5;
  }
  if (type === 'TIME_WINDOW') {
    // TIME_WINDOW requires a budget too
    if (!budgetUsd) {
      throw new Error('budgetUsd is required for TIME_WINDOW type');
    }
    effectiveBudgetUsd = budgetUsd;
  }

  // Get protocol and validate balance
  const protocol = await db.protocolSponsor.findUnique({
    where: { protocolId },
  });

  if (!protocol) {
    throw new Error(`Protocol ${protocolId} not found`);
  }

  const validation = validateProtocolBalance(protocol.balanceUSD, effectiveBudgetUsd, tier);

  if (!validation.valid) {
    throw new Error(
      `Insufficient balance. Required: $${validation.requiredAmount.toFixed(2)}, ` +
        `Available: $${protocol.balanceUSD.toFixed(2)}, ` +
        `Shortfall: $${validation.shortfall.toFixed(2)}`
    );
  }

  // Get tier config for SLA parameters
  const tierConfig = TIER_CONFIGS[tier];
  const effectiveMaxLatencyMs = maxLatencyMs ?? tierConfig.maxLatencyMs;
  const effectiveBreachPenalty = breachPenalty ?? tierConfig.breachPenalty;

  // Determine initial status
  const now = new Date();
  const initialStatus: GuaranteeStatus = validFrom <= now ? 'ACTIVE' : 'PENDING';

  // Create guarantee and update protocol balance in transaction
  const guarantee = await db.$transaction(async (tx) => {
    // Deduct from protocol balance
    await tx.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: { decrement: effectiveBudgetUsd + validation.premium },
        totalGuaranteedUsd: { increment: effectiveBudgetUsd },
        guaranteeReserveUsd: { increment: validation.reserve },
      },
    });

    // Create guarantee record
    const created = await tx.executionGuarantee.create({
      data: {
        type,
        beneficiary: beneficiary.toLowerCase(),
        protocolId,
        budgetUsd: type === 'GAS_BUDGET' || type === 'TIME_WINDOW' ? effectiveBudgetUsd : null,
        budgetWei: null, // Can be set if paying in ETH
        usedWei: BigInt(0),
        usedUsd: 0,
        txCount: type === 'TX_COUNT' ? txCount : null,
        usedTxCount: 0,
        maxGasPerTx: maxGasPerTx ?? null,
        maxLatencyMs: effectiveMaxLatencyMs > 0 ? effectiveMaxLatencyMs : null,
        breachPenalty: effectiveBreachPenalty > 0 ? effectiveBreachPenalty : null,
        maxGasPrice: maxGasPrice ?? null,
        validFrom,
        validUntil,
        lockedAmountUsd: effectiveBudgetUsd,
        premiumPaid: validation.premium,
        refundsIssued: 0,
        tier,
        status: initialStatus,
        activatedAt: initialStatus === 'ACTIVE' ? now : null,
      },
    });

    return created;
  });

  logger.info('[Guarantees] Created guarantee', {
    guaranteeId: guarantee.id,
    type,
    beneficiary,
    protocolId,
    tier,
    lockedAmount: effectiveBudgetUsd,
    premium: validation.premium,
    status: initialStatus,
  });

  return {
    guaranteeId: guarantee.id,
    status: initialStatus,
    lockedAmount: effectiveBudgetUsd,
    premiumCharged: validation.premium,
    effectiveFrom: validFrom,
    effectiveUntil: validUntil,
    slaTerms:
      effectiveMaxLatencyMs > 0
        ? {
            maxLatencyMs: effectiveMaxLatencyMs,
            breachPenalty: effectiveBreachPenalty,
          }
        : null,
  };
}

/**
 * Activate a pending guarantee
 *
 * Called when validFrom is reached.
 */
export async function activateGuarantee(guaranteeId: string): Promise<void> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  if (guarantee.status !== 'PENDING') {
    throw new Error(`Guarantee ${guaranteeId} is not pending (status: ${guarantee.status})`);
  }

  await db.executionGuarantee.update({
    where: { id: guaranteeId },
    data: {
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  logger.info('[Guarantees] Activated guarantee', { guaranteeId });
}

/**
 * Expire a guarantee
 *
 * Called when validUntil is passed. Returns unused budget to protocol.
 */
export async function expireGuarantee(guaranteeId: string): Promise<void> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  if (guarantee.status !== 'ACTIVE' && guarantee.status !== 'PENDING') {
    logger.warn('[Guarantees] Cannot expire non-active guarantee', {
      guaranteeId,
      status: guarantee.status,
    });
    return;
  }

  const unusedBudget = guarantee.lockedAmountUsd - guarantee.usedUsd;
  const refundAmount = calculateExpirationRefund(unusedBudget);
  const reserveToRelease = calculateReserveBuffer(
    guarantee.lockedAmountUsd,
    guarantee.tier as ServiceTier
  );

  await db.$transaction(async (tx) => {
    // Update guarantee status
    await tx.executionGuarantee.update({
      where: { id: guaranteeId },
      data: {
        status: 'EXPIRED',
        expiredAt: new Date(),
        refundsIssued: { increment: refundAmount },
      },
    });

    // Return unused budget and release reserve
    await tx.protocolSponsor.update({
      where: { protocolId: guarantee.protocolId },
      data: {
        balanceUSD: { increment: refundAmount },
        totalGuaranteedUsd: { decrement: guarantee.lockedAmountUsd },
        guaranteeReserveUsd: { decrement: reserveToRelease },
      },
    });
  });

  logger.info('[Guarantees] Expired guarantee', {
    guaranteeId,
    unusedBudget,
    refundAmount,
    reserveReleased: reserveToRelease,
  });
}

/**
 * Cancel a guarantee
 *
 * Protocol-initiated cancellation. Returns unused budget minus cancellation fee.
 */
export async function cancelGuarantee(guaranteeId: string): Promise<CancelGuaranteeResult> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  if (guarantee.status !== 'ACTIVE' && guarantee.status !== 'PENDING') {
    throw new Error(`Cannot cancel guarantee with status: ${guarantee.status}`);
  }

  const unusedBudget = guarantee.lockedAmountUsd - guarantee.usedUsd;
  const { refundAmount, cancellationFee } = calculateCancellationRefund(
    unusedBudget,
    guarantee.premiumPaid
  );
  const reserveToRelease = calculateReserveBuffer(
    guarantee.lockedAmountUsd,
    guarantee.tier as ServiceTier
  );

  await db.$transaction(async (tx) => {
    // Update guarantee status
    await tx.executionGuarantee.update({
      where: { id: guaranteeId },
      data: {
        status: 'CANCELLED',
        expiredAt: new Date(),
        refundsIssued: { increment: refundAmount },
      },
    });

    // Return refund and release reserve
    await tx.protocolSponsor.update({
      where: { protocolId: guarantee.protocolId },
      data: {
        balanceUSD: { increment: refundAmount },
        totalGuaranteedUsd: { decrement: guarantee.lockedAmountUsd },
        guaranteeReserveUsd: { decrement: reserveToRelease },
      },
    });
  });

  logger.info('[Guarantees] Cancelled guarantee', {
    guaranteeId,
    unusedBudget,
    refundAmount,
    cancellationFee,
  });

  return {
    cancelled: true,
    refundAmount,
    cancellationFee,
  };
}

/**
 * Mark guarantee as depleted
 *
 * Called when budget or transaction count is exhausted.
 */
export async function depleteGuarantee(guaranteeId: string): Promise<void> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  const reserveToRelease = calculateReserveBuffer(
    guarantee.lockedAmountUsd,
    guarantee.tier as ServiceTier
  );

  await db.$transaction(async (tx) => {
    await tx.executionGuarantee.update({
      where: { id: guaranteeId },
      data: {
        status: 'DEPLETED',
        expiredAt: new Date(),
      },
    });

    // Release reserve (budget was fully used)
    await tx.protocolSponsor.update({
      where: { protocolId: guarantee.protocolId },
      data: {
        totalGuaranteedUsd: { decrement: guarantee.lockedAmountUsd },
        guaranteeReserveUsd: { decrement: reserveToRelease },
      },
    });
  });

  logger.info('[Guarantees] Depleted guarantee', { guaranteeId });
}

/**
 * Find active guarantee for a beneficiary
 *
 * Returns the best matching active guarantee for an agent.
 */
export async function findActiveGuarantee(
  beneficiary: string,
  protocolId: string
): Promise<ExecutionGuarantee | null> {
  const now = new Date();

  const guarantee = await db.executionGuarantee.findFirst({
    where: {
      beneficiary: beneficiary.toLowerCase(),
      protocolId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
    orderBy: [
      // Prefer higher tier
      { tier: 'desc' },
      // Then prefer newer
      { createdAt: 'desc' },
    ],
  });

  if (!guarantee) {
    return null;
  }

  return {
    ...guarantee,
    budgetWei: guarantee.budgetWei,
    usedWei: guarantee.usedWei,
    maxGasPerTx: guarantee.maxGasPerTx,
    maxGasPrice: guarantee.maxGasPrice,
    type: guarantee.type as ExecutionGuarantee['type'],
    status: guarantee.status as ExecutionGuarantee['status'],
    tier: guarantee.tier as ExecutionGuarantee['tier'],
  };
}

/**
 * Get guarantee details with usage summary
 */
export async function getGuaranteeDetails(guaranteeId: string): Promise<GuaranteeDetails | null> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
    include: {
      usageRecords: true,
      breaches: true,
    },
  });

  if (!guarantee) {
    return null;
  }

  // Calculate usage summary
  const total = guarantee.lockedAmountUsd;
  const used = guarantee.usedUsd;
  const remaining = total - used;
  const utilizationPct = total > 0 ? (used / total) * 100 : 0;

  // Calculate SLA summary
  const totalExecutions = guarantee.usageRecords.length;
  const slaMet = guarantee.usageRecords.filter((u) => u.slaMet === true).length;
  const slaBreached = guarantee.usageRecords.filter((u) => u.slaMet === false).length;
  const complianceRate = totalExecutions > 0 ? (slaMet / totalExecutions) * 100 : 100;

  // Calculate financial summary
  const refundsIssued = guarantee.refundsIssued;
  const netCost = guarantee.premiumPaid + used - refundsIssued;

  // Calculate validity
  const now = new Date();
  const remainingMs = guarantee.validUntil.getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return {
    id: guarantee.id,
    type: guarantee.type as GuaranteeDetails['type'],
    beneficiary: guarantee.beneficiary,
    protocolId: guarantee.protocolId,
    status: guarantee.status as GuaranteeDetails['status'],
    tier: guarantee.tier as GuaranteeDetails['tier'],
    budget: {
      total,
      used,
      remaining,
      utilizationPct,
    },
    sla: {
      totalExecutions,
      slaMet,
      slaBreached,
      complianceRate,
    },
    financial: {
      lockedAmount: guarantee.lockedAmountUsd,
      premiumPaid: guarantee.premiumPaid,
      refundsIssued,
      netCost,
    },
    validity: {
      from: guarantee.validFrom,
      until: guarantee.validUntil,
      remainingDays,
    },
    createdAt: guarantee.createdAt,
    updatedAt: guarantee.updatedAt,
  };
}

/**
 * List guarantees for a protocol
 */
export async function listGuarantees(
  protocolId: string,
  options: {
    status?: GuaranteeStatus;
    beneficiary?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExecutionGuarantee[]> {
  const { status, beneficiary, limit = 50, offset = 0 } = options;

  const guarantees = await db.executionGuarantee.findMany({
    where: {
      protocolId,
      ...(status && { status }),
      ...(beneficiary && { beneficiary: beneficiary.toLowerCase() }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return guarantees.map((g) => ({
    ...g,
    budgetWei: g.budgetWei,
    usedWei: g.usedWei,
    maxGasPerTx: g.maxGasPerTx,
    maxGasPrice: g.maxGasPrice,
    type: g.type as ExecutionGuarantee['type'],
    status: g.status as ExecutionGuarantee['status'],
    tier: g.tier as ExecutionGuarantee['tier'],
  }));
}
