/**
 * Execution Guarantees - Breach Handler
 *
 * Handles SLA breaches, calculates refunds, and processes them.
 */

import type { GuaranteeBreach, Prisma } from '@prisma/client';
import { getPrisma } from '../../db';
import { logger } from '../../logger';
import { BreachType, ExecutionGuarantee, GuaranteeBreachRecord, ServiceTier } from './types';
import { calculateBreachRefund } from './pricing';

const db = getPrisma();

// Auto-refund threshold in USD
const AUTO_REFUND_THRESHOLD_USD = 100;

/**
 * Handle an SLA breach
 *
 * Called when a transaction fails to meet SLA requirements.
 */
export async function handleSlaBreach(params: {
  guarantee: ExecutionGuarantee;
  usageId?: string;
  breachType: BreachType;
  breachDetails: Record<string, unknown>;
  costUsd: number;
}): Promise<GuaranteeBreachRecord> {
  const { guarantee, usageId, breachType, breachDetails, costUsd } = params;

  // Calculate refund amount
  const refundAmount = calculateBreachRefund(costUsd, guarantee.tier);

  // Determine if we should auto-refund
  const shouldAutoRefund = refundAmount < AUTO_REFUND_THRESHOLD_USD;

  // Create breach record
  const breach = await db.$transaction(async (tx) => {
    const breachRecord = await tx.guaranteeBreach.create({
      data: {
        guaranteeId: guarantee.id,
        usageId: usageId ?? null,
        breachType,
        breachDetails: breachDetails as Prisma.InputJsonValue,
        refundAmount,
        refundStatus: shouldAutoRefund ? 'APPROVED' : 'PENDING',
        refundedAt: null,
      },
    });

    // If auto-refund, process immediately
    if (shouldAutoRefund) {
      await tx.protocolSponsor.update({
        where: { protocolId: guarantee.protocolId },
        data: {
          balanceUSD: { increment: refundAmount },
        },
      });

      await tx.guaranteeBreach.update({
        where: { id: breachRecord.id },
        data: {
          refundStatus: 'REFUNDED',
          refundedAt: new Date(),
        },
      });

      await tx.executionGuarantee.update({
        where: { id: guarantee.id },
        data: {
          refundsIssued: { increment: refundAmount },
        },
      });

      logger.info('[Guarantees] Auto-refunded SLA breach', {
        guaranteeId: guarantee.id,
        breachId: breachRecord.id,
        refundAmount,
        breachType,
      });
    } else {
      logger.info('[Guarantees] SLA breach pending manual review', {
        guaranteeId: guarantee.id,
        breachId: breachRecord.id,
        refundAmount,
        breachType,
      });
    }

    return breachRecord;
  });

  return {
    ...breach,
    breachType: breach.breachType as BreachType,
    breachDetails: breach.breachDetails as Record<string, unknown>,
    refundStatus: breach.refundStatus as GuaranteeBreachRecord['refundStatus'],
  };
}

/**
 * Approve a pending breach refund
 *
 * For manual approval of large refunds.
 */
export async function approveBreachRefund(breachId: string): Promise<void> {
  const breach = await db.guaranteeBreach.findUnique({
    where: { id: breachId },
    include: { guarantee: true },
  });

  if (!breach) {
    throw new Error(`Breach ${breachId} not found`);
  }

  if (breach.refundStatus !== 'PENDING') {
    throw new Error(`Breach ${breachId} is not pending (status: ${breach.refundStatus})`);
  }

  await db.$transaction(async (tx) => {
    // Credit protocol
    await tx.protocolSponsor.update({
      where: { protocolId: breach.guarantee.protocolId },
      data: {
        balanceUSD: { increment: breach.refundAmount },
      },
    });

    // Update breach status
    await tx.guaranteeBreach.update({
      where: { id: breachId },
      data: {
        refundStatus: 'REFUNDED',
        refundedAt: new Date(),
      },
    });

    // Update guarantee refunds issued
    await tx.executionGuarantee.update({
      where: { id: breach.guaranteeId },
      data: {
        refundsIssued: { increment: breach.refundAmount },
      },
    });
  });

  logger.info('[Guarantees] Approved breach refund', {
    breachId,
    guaranteeId: breach.guaranteeId,
    refundAmount: breach.refundAmount,
  });
}

/**
 * Reject a pending breach refund
 */
export async function rejectBreachRefund(breachId: string, reason: string): Promise<void> {
  const breach = await db.guaranteeBreach.findUnique({
    where: { id: breachId },
  });

  if (!breach) {
    throw new Error(`Breach ${breachId} not found`);
  }

  if (breach.refundStatus !== 'PENDING') {
    throw new Error(`Breach ${breachId} is not pending (status: ${breach.refundStatus})`);
  }

  await db.guaranteeBreach.update({
    where: { id: breachId },
    data: {
      refundStatus: 'REJECTED',
      breachDetails: {
        ...(breach.breachDetails as Record<string, unknown>),
        rejectionReason: reason,
      },
    },
  });

  logger.info('[Guarantees] Rejected breach refund', {
    breachId,
    reason,
  });
}

/**
 * Get pending breaches for review
 */
export async function getPendingBreaches(options: {
  limit?: number;
  offset?: number;
}): Promise<GuaranteeBreachRecord[]> {
  const { limit = 50, offset = 0 } = options;

  const breaches = await db.guaranteeBreach.findMany({
    where: { refundStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    skip: offset,
  });

  return breaches.map((b: GuaranteeBreach) => ({
    ...b,
    breachType: b.breachType as BreachType,
    breachDetails: b.breachDetails as Record<string, unknown>,
    refundStatus: b.refundStatus as GuaranteeBreachRecord['refundStatus'],
  }));
}

/**
 * Get breach history for a guarantee
 */
export async function getGuaranteeBreaches(
  guaranteeId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<GuaranteeBreachRecord[]> {
  const { limit = 50, offset = 0 } = options;

  const breaches = await db.guaranteeBreach.findMany({
    where: { guaranteeId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return breaches.map((b: GuaranteeBreach) => ({
    ...b,
    breachType: b.breachType as BreachType,
    breachDetails: b.breachDetails as Record<string, unknown>,
    refundStatus: b.refundStatus as GuaranteeBreachRecord['refundStatus'],
  }));
}

/**
 * Check SLA compliance for a usage record
 *
 * Returns breach details if SLA was not met.
 */
export function checkSlaCompliance(
  guarantee: ExecutionGuarantee,
  latencyMs: number | null
): { compliant: boolean; breach?: { type: BreachType; details: Record<string, unknown> } } {
  // No SLA to check
  if (!guarantee.maxLatencyMs || latencyMs === null) {
    return { compliant: true };
  }

  if (latencyMs > guarantee.maxLatencyMs) {
    return {
      compliant: false,
      breach: {
        type: 'SLA_MISSED',
        details: {
          maxLatencyMs: guarantee.maxLatencyMs,
          actualLatencyMs: latencyMs,
          overage: latencyMs - guarantee.maxLatencyMs,
          tier: guarantee.tier,
        },
      },
    };
  }

  return { compliant: true };
}
