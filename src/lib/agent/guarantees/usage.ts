/**
 * Execution Guarantees - Usage Tracking
 *
 * Records guarantee usage and updates consumption.
 */

import { getPrisma } from '../../db';
import { logger } from '../../logger';
import { ExecutionGuarantee, GuaranteeUsageRecord } from './types';
import { depleteGuarantee } from './lifecycle';

const db = getPrisma();

/**
 * Record usage of a guarantee
 *
 * Called after a sponsored transaction completes.
 */
export async function recordGuaranteeUsage(params: {
  guaranteeId: string;
  userOpHash: string;
  txHash?: string;
  gasUsed: bigint;
  gasPriceWei: bigint;
  costUsd: number;
  submittedAt: Date;
  includedAt?: Date;
}): Promise<GuaranteeUsageRecord> {
  const {
    guaranteeId,
    userOpHash,
    txHash,
    gasUsed,
    gasPriceWei,
    costUsd,
    submittedAt,
    includedAt,
  } = params;

  // Calculate cost in wei
  const costWei = gasUsed * gasPriceWei;

  // Calculate latency if we have inclusion time
  const latencyMs = includedAt ? includedAt.getTime() - submittedAt.getTime() : null;

  // Get the guarantee to check SLA
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  // Determine if SLA was met
  let slaMet: boolean | null = null;
  if (guarantee.maxLatencyMs && latencyMs !== null) {
    slaMet = latencyMs <= guarantee.maxLatencyMs;
  }

  // Create usage record and update guarantee in transaction
  const usage = await db.$transaction(async (tx) => {
    // Create usage record
    const record = await tx.guaranteeUsage.create({
      data: {
        guaranteeId,
        userOpHash,
        txHash: txHash ?? null,
        gasUsed,
        gasPriceWei,
        costWei,
        costUsd,
        submittedAt,
        includedAt: includedAt ?? null,
        latencyMs,
        slaMet,
      },
    });

    // Update guarantee consumption
    await tx.executionGuarantee.update({
      where: { id: guaranteeId },
      data: {
        usedWei: { increment: costWei },
        usedUsd: { increment: costUsd },
        usedTxCount: { increment: 1 },
      },
    });

    return record;
  });

  logger.info('[Guarantees] Recorded usage', {
    guaranteeId,
    userOpHash,
    costUsd,
    latencyMs,
    slaMet,
  });

  // Check if guarantee is depleted
  await checkDepletion(guaranteeId);

  return {
    ...usage,
    gasUsed: usage.gasUsed,
    gasPriceWei: usage.gasPriceWei,
    costWei: usage.costWei,
  };
}

/**
 * Check if a guarantee is depleted and mark it if so
 */
async function checkDepletion(guaranteeId: string): Promise<void> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee || guarantee.status !== 'ACTIVE') {
    return;
  }

  let isDepleted = false;

  // Check budget depletion
  if (guarantee.budgetUsd && guarantee.usedUsd >= guarantee.budgetUsd) {
    isDepleted = true;
  }

  // Check transaction count depletion
  if (guarantee.txCount && guarantee.usedTxCount >= guarantee.txCount) {
    isDepleted = true;
  }

  if (isDepleted) {
    await depleteGuarantee(guaranteeId);
  }
}

/**
 * Usage history response with pagination and summary
 */
export interface GuaranteeUsageHistoryResponse {
  records: GuaranteeUsageRecord[];
  total: number;
  summary: {
    totalRecords: number;
    totalCostUsd: number;
    avgLatencyMs: number | null;
    slaMetCount: number;
    slaBreachedCount: number;
    complianceRate: number;
  };
}

/**
 * Get usage history for a guarantee
 */
export async function getGuaranteeUsageHistory(
  guaranteeId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<GuaranteeUsageHistoryResponse> {
  const { limit = 50, offset = 0 } = options;

  // Verify guarantee exists
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    throw new Error(`Guarantee ${guaranteeId} not found`);
  }

  // Get total count
  const total = await db.guaranteeUsage.count({
    where: { guaranteeId },
  });

  // Get paginated records
  const records = await db.guaranteeUsage.findMany({
    where: { guaranteeId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  // Get summary statistics
  const allRecords = await db.guaranteeUsage.findMany({
    where: { guaranteeId },
    select: {
      costUsd: true,
      latencyMs: true,
      slaMet: true,
    },
  });

  const totalCostUsd = allRecords.reduce((sum, r) => sum + r.costUsd, 0);
  const latencies = allRecords.filter((r) => r.latencyMs !== null).map((r) => r.latencyMs!);
  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

  const slaMetCount = allRecords.filter((r) => r.slaMet === true).length;
  const slaBreachedCount = allRecords.filter((r) => r.slaMet === false).length;
  const slaCheckedCount = slaMetCount + slaBreachedCount;
  const complianceRate = slaCheckedCount > 0 ? (slaMetCount / slaCheckedCount) * 100 : 100;

  return {
    records: records.map((r) => ({
      ...r,
      gasUsed: r.gasUsed,
      gasPriceWei: r.gasPriceWei,
      costWei: r.costWei,
    })),
    total,
    summary: {
      totalRecords: allRecords.length,
      totalCostUsd,
      avgLatencyMs,
      slaMetCount,
      slaBreachedCount,
      complianceRate,
    },
  };
}

/**
 * Check if a guarantee has capacity for a transaction
 */
export async function checkGuaranteeCapacity(
  guarantee: ExecutionGuarantee,
  estimatedCostUsd: number
): Promise<{ hasCapacity: boolean; reason?: string }> {
  // Check budget capacity
  if (guarantee.budgetUsd) {
    const remaining = guarantee.budgetUsd - guarantee.usedUsd;
    if (estimatedCostUsd > remaining) {
      return {
        hasCapacity: false,
        reason: `Insufficient budget: need $${estimatedCostUsd.toFixed(4)}, have $${remaining.toFixed(4)}`,
      };
    }
  }

  // Check transaction count capacity
  if (guarantee.txCount) {
    if (guarantee.usedTxCount >= guarantee.txCount) {
      return {
        hasCapacity: false,
        reason: `Transaction count exhausted: ${guarantee.usedTxCount}/${guarantee.txCount}`,
      };
    }
  }

  return { hasCapacity: true };
}

/**
 * Check if gas price is within guarantee constraints
 */
export function checkGasPriceConstraint(
  guarantee: ExecutionGuarantee,
  currentGasPriceWei: bigint
): { withinLimit: boolean; reason?: string } {
  if (!guarantee.maxGasPrice) {
    return { withinLimit: true };
  }

  if (currentGasPriceWei > guarantee.maxGasPrice) {
    const maxGwei = Number(guarantee.maxGasPrice) / 1e9;
    const currentGwei = Number(currentGasPriceWei) / 1e9;
    return {
      withinLimit: false,
      reason: `Gas price ${currentGwei.toFixed(2)} gwei exceeds limit ${maxGwei.toFixed(2)} gwei`,
    };
  }

  return { withinLimit: true };
}

/**
 * Get depletion percentage for alert thresholds
 */
export async function getDepletionPercentage(guaranteeId: string): Promise<number> {
  const guarantee = await db.executionGuarantee.findUnique({
    where: { id: guaranteeId },
  });

  if (!guarantee) {
    return 0;
  }

  // Budget-based depletion
  if (guarantee.budgetUsd) {
    return (guarantee.usedUsd / guarantee.budgetUsd) * 100;
  }

  // Transaction count-based depletion
  if (guarantee.txCount) {
    return (guarantee.usedTxCount / guarantee.txCount) * 100;
  }

  return 0;
}
