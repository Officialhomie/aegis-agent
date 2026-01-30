/**
 * Aegis Agent - Reputation Tracking (ERC-8004)
 *
 * Records attestations after execution and aggregates reputation.
 */

import type { ExecutionResult } from '../execute';

type PrismaClient = any;
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client') as { PrismaClient: PrismaClient };
    prisma = new PrismaClient();
  }
  return prisma;
}

export interface ReputationAttestationInput {
  agentOnChainId: string;
  attestor: string;
  attestationType: 'SUCCESS' | 'FAILURE' | 'QUALITY';
  score: number;
  chainId: number;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calculate quality score (0-100) from execution result
 */
export function calculateQualityScore(execution: ExecutionResult): number {
  if (!execution.success) return 0;
  let score = 50;
  if (execution.transactionHash) score += 20;
  if (execution.gasUsed !== undefined) {
    const gas = Number(execution.gasUsed);
    if (gas < 100_000) score += 15;
    else if (gas < 500_000) score += 10;
  }
  if (execution.simulationResult && !execution.error) score += 15;
  return Math.min(100, score);
}

/**
 * Submit reputation attestation to DB (and optionally on-chain when ERC-8004 is live)
 */
export async function submitReputationAttestation(input: ReputationAttestationInput): Promise<string> {
  const db = getPrisma();
  try {
    const attestation = await db.reputationAttestation.create({
      data: {
        agentOnChainId: input.agentOnChainId,
        attestor: input.attestor,
        attestationType: input.attestationType,
        score: input.score,
        chainId: input.chainId,
        txHash: input.txHash,
        metadata: input.metadata ?? undefined,
      },
    });
    return attestation.id;
  } catch (error) {
    console.error('[Reputation] Failed to create attestation:', error);
    throw error;
  }
}

/**
 * Record execution outcome as reputation attestation
 */
export async function recordExecution(
  agentOnChainId: string,
  execution: ExecutionResult,
  chainId: number,
  attestor: string = '0x0000000000000000000000000000000000000000'
): Promise<string | null> {
  const type = execution.success ? 'SUCCESS' : 'FAILURE';
  const score = calculateQualityScore(execution);
  return submitReputationAttestation({
    agentOnChainId,
    attestor,
    attestationType: type,
    score,
    chainId,
    txHash: execution.transactionHash,
    metadata: {
      success: execution.success,
      error: execution.error,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get aggregated reputation for an agent (average score, count)
 */
export async function getReputationScore(agentOnChainId: string): Promise<{ averageScore: number; count: number }> {
  const db = getPrisma();
  try {
    const attestations = await db.reputationAttestation.findMany({
      where: { agentOnChainId },
      select: { score: true },
    });
    if (attestations.length === 0) return { averageScore: 0, count: 0 };
    const sum = attestations.reduce((s: number, a: { score: number }) => s + a.score, 0);
    return { averageScore: sum / attestations.length, count: attestations.length };
  } catch {
    return { averageScore: 0, count: 0 };
  }
}
