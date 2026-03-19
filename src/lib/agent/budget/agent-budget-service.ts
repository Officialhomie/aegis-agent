/**
 * Aegis Agent Budget Service - Per-agent atomic spend tracking.
 *
 * Fixes the TOCTOU race condition in the existing approved-agent-check:
 * 1. Acquire Redis distributed lock per (protocolId, agentAddress)
 * 2. Check current daily spend from AgentSpendLedger
 * 3. Create a RESERVED entry (optimistic lock)
 * 4. Release Redis lock
 *
 * On success: commitReservation() marks the entry COMMITTED.
 * On failure: releaseReservation() deletes the RESERVED entry.
 *
 * The AgentSpendLedger DB model must be added to the Prisma schema (Phase 7).
 */

import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import type { BudgetReservationResult, BudgetCheckResult, AgentDailyUsage } from './types';

const LOCK_TTL_MS = 5_000; // 5-second lock TTL

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function lockKey(protocolId: string, agentAddress: string): string {
  return `aegis:budget-lock:${protocolId}:${agentAddress.toLowerCase()}`;
}

async function acquireLock(key: string): Promise<boolean> {
  const store = await getStateStore();
  return store.setNX(key, Date.now().toString(), { px: LOCK_TTL_MS });
}

async function releaseLock(key: string): Promise<void> {
  const store = await getStateStore();
  // Simple delete via overwrite with 1ms TTL (no del() in StateStore interface)
  await store.set(key, 'released', { px: 1 });
}

/**
 * Get today's committed + reserved spend for an agent.
 * Non-atomic — safe for read-only checks, not for deduction.
 */
export async function getAgentDailySpend(
  protocolId: string,
  agentAddress: string
): Promise<AgentDailyUsage> {
  const { getPrisma } = await import('../../db');
  const db = getPrisma();
  const date = today();
  const addr = agentAddress.toLowerCase();

  const [records, approval] = await Promise.all([
    db.agentSpendLedger.findMany({
      where: {
        protocolId,
        agentAddress: addr,
        date,
        status: { in: ['RESERVED', 'COMMITTED'] },
      },
      select: { estimatedUSD: true, actualUSD: true, status: true },
    }),
    db.approvedAgent.findUnique({
      where: { protocolId_agentAddress: { protocolId, agentAddress: addr } },
      select: { maxDailyBudget: true },
    }),
  ]);

  const committedUSD = records
    .filter((r) => r.status === 'COMMITTED')
    .reduce((sum, r) => sum + (r.actualUSD ?? r.estimatedUSD), 0);

  const reservedUSD = records
    .filter((r) => r.status === 'RESERVED')
    .reduce((sum, r) => sum + r.estimatedUSD, 0);

  const totalUSD = committedUSD + reservedUSD;
  const maxDailyBudget = approval?.maxDailyBudget ?? 0;

  return {
    protocolId,
    agentAddress: addr,
    date,
    committedUSD,
    reservedUSD,
    totalUSD,
    txCount: records.filter((r) => r.status === 'COMMITTED').length,
    maxDailyBudget,
    remainingUSD: Math.max(0, maxDailyBudget - totalUSD),
  };
}

/**
 * Non-atomic budget check — used by policy rules for a quick eligibility read.
 * NOT used for actual deduction.
 */
export async function checkAgentBudget(
  protocolId: string,
  agentAddress: string,
  amountUSD: number,
  tierMultiplier = 1.0
): Promise<BudgetCheckResult> {
  try {
    const usage = await getAgentDailySpend(protocolId, agentAddress);

    if (usage.maxDailyBudget <= 0) {
      // No per-agent budget configured — allow (protocol-level budget is the limit)
      return { allowed: true, reason: 'No per-agent daily budget configured' };
    }

    const effectiveBudget = usage.maxDailyBudget * tierMultiplier;
    const projected = usage.totalUSD + amountUSD;

    if (projected > effectiveBudget) {
      return {
        allowed: false,
        reason: `Agent daily budget exceeded: $${projected.toFixed(4)} > $${effectiveBudget.toFixed(2)} (tier multiplier ${tierMultiplier}x)`,
        currentSpendUSD: usage.totalUSD,
        maxDailyBudget: effectiveBudget,
      };
    }

    return {
      allowed: true,
      currentSpendUSD: usage.totalUSD,
      maxDailyBudget: effectiveBudget,
    };
  } catch (error) {
    logger.error('[BudgetService] checkAgentBudget failed — failing CLOSED', {
      protocolId,
      agentAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: false, reason: 'Budget check unavailable — failing CLOSED' };
  }
}

/**
 * Atomically reserve budget for an agent.
 *
 * Steps:
 * 1. Acquire Redis distributed lock
 * 2. Read current daily spend from DB
 * 3. Check against maxDailyBudget (with tier multiplier)
 * 4. If OK: create RESERVED ledger entry
 * 5. Release lock
 *
 * Returns `{ reserved: true, reservationId }` on success.
 */
export async function reserveAgentBudget(
  protocolId: string,
  agentAddress: string,
  estimatedUSD: number,
  agentTier: number
): Promise<BudgetReservationResult> {
  const addr = agentAddress.toLowerCase();
  const key = lockKey(protocolId, addr);
  const reservationId = randomUUID();

  let lockAcquired = false;

  try {
    lockAcquired = await acquireLock(key);
    if (!lockAcquired) {
      logger.warn('[BudgetService] Lock contention — could not acquire budget lock', {
        protocolId,
        agentAddress: addr,
      });
      return { reserved: false, error: 'Budget lock contention — retry' };
    }

    const { getPrisma } = await import('../../db');
    const db = getPrisma();

    // Read max daily budget for this agent
    const approval = await db.approvedAgent.findUnique({
      where: { protocolId_agentAddress: { protocolId, agentAddress: addr } },
      select: { maxDailyBudget: true, isActive: true },
    });

    if (!approval?.isActive) {
      await releaseLock(key);
      return { reserved: false, error: 'Agent not approved or inactive' };
    }

    const maxDailyBudget = approval.maxDailyBudget;

    if (maxDailyBudget > 0) {
      // Tier multiplier: ERC-8004 gets 3x headroom, ERC-4337 gets 1x, others 0.5x
      const tierMultiplier = agentTier === 1 ? 3.0 : agentTier === 2 ? 1.0 : 0.5;
      const effectiveBudget = maxDailyBudget * tierMultiplier;

      // Sum existing committed + reserved for today
      const date = today();
      const existing = await db.agentSpendLedger.aggregate({
        where: {
          protocolId,
          agentAddress: addr,
          date,
          status: { in: ['RESERVED', 'COMMITTED'] },
        },
        _sum: { estimatedUSD: true },
      });

      const currentSpend = existing._sum.estimatedUSD ?? 0;
      if (currentSpend + estimatedUSD > effectiveBudget) {
        await releaseLock(key);
        return {
          reserved: false,
          error: `Agent daily budget exceeded: $${(currentSpend + estimatedUSD).toFixed(4)} > $${effectiveBudget.toFixed(2)}`,
        };
      }
    }

    // Create RESERVED ledger entry
    await db.agentSpendLedger.create({
      data: {
        protocolId,
        agentAddress: addr,
        date: today(),
        estimatedUSD,
        status: 'RESERVED',
        reservationId,
        agentTier,
      },
    });

    await releaseLock(key);

    logger.debug('[BudgetService] Budget reserved', {
      protocolId,
      agentAddress: addr,
      estimatedUSD,
      reservationId,
    });

    return { reserved: true, reservationId };
  } catch (error) {
    if (lockAcquired) {
      await releaseLock(key).catch(() => {});
    }
    logger.error('[BudgetService] reserveAgentBudget failed', {
      protocolId,
      agentAddress: addr,
      error: error instanceof Error ? error.message : String(error),
    });
    return { reserved: false, error: 'Budget reservation failed — database error' };
  }
}

/**
 * Commit a reservation after the UserOp is confirmed onchain.
 * Updates status to COMMITTED and records the actual cost and tx hashes.
 */
export async function commitReservation(
  reservationId: string,
  actual: { amountUSD: number; userOpHash: string; txHash?: string }
): Promise<void> {
  const { getPrisma } = await import('../../db');
  const db = getPrisma();

  await db.agentSpendLedger.update({
    where: { reservationId },
    data: {
      status: 'COMMITTED',
      actualUSD: actual.amountUSD,
      userOpHash: actual.userOpHash,
      txHash: actual.txHash,
      committedAt: new Date(),
    },
  });

  logger.debug('[BudgetService] Reservation committed', {
    reservationId,
    actualUSD: actual.amountUSD,
    userOpHash: actual.userOpHash,
  });
}

/**
 * Release a reservation without committing (UserOp failed or was cancelled).
 * Marks the entry RELEASED so it no longer counts against the daily budget.
 */
export async function releaseReservation(reservationId: string, reason: string): Promise<void> {
  const { getPrisma } = await import('../../db');
  const db = getPrisma();

  await db.agentSpendLedger.update({
    where: { reservationId },
    data: {
      status: 'RELEASED',
      releasedAt: new Date(),
    },
  });

  logger.debug('[BudgetService] Reservation released', { reservationId, reason });
}
