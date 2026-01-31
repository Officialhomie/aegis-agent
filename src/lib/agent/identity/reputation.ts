/**
 * Aegis Agent - Reputation Tracking (ERC-8004)
 *
 * Records attestations after execution (DB and optionally on-chain) and aggregates reputation.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { PrismaClient } from '@prisma/client';
import type { ExecutionResult } from '../execute';

const ATTEST_ABI = [
  {
    inputs: [
      { name: 'agentOnChainId', type: 'string' },
      { name: 'score', type: 'uint8' },
      { name: 'attestationType', type: 'uint8' },
    ],
    name: 'attest',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
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
 * Submit reputation attestation to DB and optionally on-chain when REPUTATION_ATTESTATION_CONTRACT_ADDRESS is set.
 */
export async function submitReputationAttestation(input: ReputationAttestationInput): Promise<string> {
  let txHash: string | undefined = input.txHash;
  const contractAddress = process.env.REPUTATION_ATTESTATION_CONTRACT_ADDRESS as `0x${string}` | undefined;
  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;

  if (contractAddress && privateKey) {
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
    if (rpcUrl) {
      try {
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        const walletClient = createWalletClient({
          account,
          chain: baseSepolia,
          transport: http(rpcUrl),
        });
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(rpcUrl),
        });
        const typeNum = input.attestationType === 'SUCCESS' ? 0 : input.attestationType === 'FAILURE' ? 1 : 2;
        const score = Math.min(100, Math.max(0, input.score));
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ATTEST_ABI,
          functionName: 'attest',
          args: [input.agentOnChainId, score as 0 | number, typeNum as 0 | number],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        txHash = receipt.transactionHash;
      } catch (err) {
        console.error('[Reputation] On-chain attestation failed:', err);
      }
    }
  }

  const db = getPrisma();
  try {
    const attestation = await db.reputationAttestation.create({
      data: {
        agentOnChainId: input.agentOnChainId,
        attestor: input.attestor,
        attestationType: input.attestationType,
        score: input.score,
        chainId: input.chainId,
        txHash: txHash ?? undefined,
        metadata: (input.metadata ?? undefined) as object | undefined,
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
 * Get aggregated reputation for an agent (average score, count) with pagination
 */
export async function getReputationScore(
  agentOnChainId: string,
  options?: { take?: number; skip?: number }
): Promise<{ averageScore: number; count: number }> {
  const db = getPrisma();
  const take = Math.min(options?.take ?? 100, 500);
  const skip = options?.skip ?? 0;
  try {
    const [attestations, total] = await Promise.all([
      db.reputationAttestation.findMany({
        where: { agentOnChainId },
        select: { score: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      db.reputationAttestation.count({ where: { agentOnChainId } }),
    ]);
    if (attestations.length === 0) return { averageScore: 0, count: total };
    const sum = attestations.reduce((s: number, a: { score: number }) => s + a.score, 0);
    return { averageScore: sum / attestations.length, count: total };
  } catch {
    return { averageScore: 0, count: 0 };
  }
}
