/**
 * Aegis Agent - Unified Reputation
 *
 * Bridges reputation across Moltbook karma, ERC-8004 on-chain attestations, and x402 payment history.
 */

import { PrismaClient } from '@prisma/client';
import { getReputationScore } from './reputation';
import { getMoltbookProfile } from '../social/moltbook';
import type { MoltbookAgentProfile } from '../social/moltbook';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export interface PaymentSuccessMetrics {
  successRate: number;
  total: number;
  executed: number;
  pending: number;
}

export interface UnifiedReputation {
  moltbook: MoltbookAgentProfile | null;
  onChain: { averageScore: number; count: number };
  payments: PaymentSuccessMetrics;
  combined: number;
}

/**
 * Get payment success rate for this agent (all PaymentRecords in DB).
 */
export async function getPaymentSuccessRate(): Promise<PaymentSuccessMetrics> {
  const db = getPrisma();
  try {
    const [executed, total, pending] = await Promise.all([
      db.paymentRecord.count({ where: { status: 'EXECUTED' } }),
      db.paymentRecord.count(),
      db.paymentRecord.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] } } }),
    ]);
    return {
      successRate: total > 0 ? executed / total : 0,
      total,
      executed,
      pending,
    };
  } catch {
    return { successRate: 0, total: 0, executed: 0, pending: 0 };
  }
}

/**
 * Calculate combined reputation score (0-100) from Moltbook karma, on-chain attestations, and payment success.
 */
function calculateCombinedScore(
  moltbook: MoltbookAgentProfile | null,
  onChain: { averageScore: number; count: number },
  payments: PaymentSuccessMetrics
): number {
  const moltbookScore = moltbook?.karma != null ? Math.min(50, moltbook.karma / 10) : 0;
  const onChainScore = onChain.count > 0 ? (onChain.averageScore / 100) * 30 : 0;
  const paymentScore = payments.total > 0 ? payments.successRate * 20 : 0;

  return Math.min(100, moltbookScore + onChainScore + paymentScore);
}

/**
 * Get unified reputation across Moltbook, on-chain attestations, and payment history.
 * agentOnChainId: ERC-8004 or mock token ID for on-chain reputation.
 */
export async function getUnifiedReputation(agentOnChainId: string): Promise<UnifiedReputation> {
  let moltbook: MoltbookAgentProfile | null = null;
  try {
    moltbook = await getMoltbookProfile();
  } catch {
    // Moltbook not configured or API error
  }

  const onChain = await getReputationScore(agentOnChainId);
  const payments = await getPaymentSuccessRate();
  const combined = calculateCombinedScore(moltbook, onChain, payments);

  return {
    moltbook,
    onChain,
    payments,
    combined,
  };
}
