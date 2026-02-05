/**
 * Aegis Agent - Reputation (ERC-8004)
 *
 * Uses official ERC-8004 Reputation Registry when configured.
 * giveFeedback is for clients (msg.sender must not be agent owner); DB attestations remain for internal recording.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia, mainnet, sepolia } from 'viem/chains';
import { getPrisma } from '../../db';
import { getKeystoreAccount } from '../../keystore';
import type { ExecutionResult } from '../execute';
import { REPUTATION_REGISTRY_ABI } from './abis/reputation-registry';
import { ERC8004_ADDRESSES, type ERC8004Network } from './constants';
import { logger } from '../../logger';

function getERC8004Chain() {
  const network = (process.env.ERC8004_NETWORK ?? 'sepolia') as ERC8004Network;
  if (network === 'mainnet') return mainnet;
  if (network === 'base-sepolia') return baseSepolia;
  return sepolia;
}

function getReputationRegistryAddress(): `0x${string}` | undefined {
  const override = process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS?.trim();
  if (override) return override as `0x${string}`;
  const legacy = process.env.REPUTATION_ATTESTATION_CONTRACT_ADDRESS?.trim();
  if (legacy) return legacy as `0x${string}`;
  const network = (process.env.ERC8004_NETWORK ?? 'sepolia') as ERC8004Network;
  const addr = ERC8004_ADDRESSES[network]?.reputationRegistry;
  if (addr) return addr as `0x${string}`;
  return undefined;
}

function getRpcUrl(): string | undefined {
  const url = process.env.ERC8004_RPC_URL?.trim();
  if (url) return url;
  const network = process.env.ERC8004_NETWORK ?? 'sepolia';
  if (network === 'mainnet') return process.env.RPC_URL_ETHEREUM;
  if (network === 'base-sepolia') return process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
  return process.env.RPC_URL_SEPOLIA;
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
 * Give feedback on Reputation Registry (official ERC-8004 giveFeedback).
 * Caller (msg.sender) must not be the agent owner or the tx will revert with "Self-feedback not allowed".
 * Use when a client wallet is submitting feedback; for internal recording use submitReputationAttestation.
 */
export async function giveFeedback(params: {
  agentId: bigint;
  value: number;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: `0x${string}`;
}): Promise<{ txHash: string; feedbackIndex: bigint }> {
  const registryAddress = getReputationRegistryAddress();
  if (!registryAddress) {
    throw new Error('ERC-8004 Reputation Registry not configured');
  }
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004');
  const chain = getERC8004Chain();
  const account = await getKeystoreAccount();
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const valueDecimals = params.valueDecimals ?? 0;
  const valueScaled = BigInt(Math.round(params.value * Math.pow(10, valueDecimals)));
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [
      params.agentId,
      valueScaled,
      valueDecimals,
      params.tag1 ?? '',
      params.tag2 ?? '',
      params.endpoint ?? '',
      params.feedbackURI ?? '',
      params.feedbackHash ?? ('0x' as `0x${string}`),
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const lastIndex = await publicClient.readContract({
    address: registryAddress,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getLastIndex',
    args: [params.agentId, account.address],
  });
  return { txHash: receipt.transactionHash, feedbackIndex: lastIndex };
}

/**
 * Get feedback summary from Reputation Registry (official getSummary).
 */
export async function getFeedbackSummary(
  agentId: bigint,
  clientAddresses: string[]
): Promise<{ count: number; averageValue: number; valueDecimals: number }> {
  const registryAddress = getReputationRegistryAddress();
  if (!registryAddress) {
    return { count: 0, averageValue: 0, valueDecimals: 0 };
  }
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) return { count: 0, averageValue: 0, valueDecimals: 0 };
  try {
    const publicClient = createPublicClient({
      chain: getERC8004Chain(),
      transport: http(rpcUrl),
    });
    const addresses = clientAddresses.length > 0 ? (clientAddresses as `0x${string}`[]) : [];
    if (addresses.length === 0) {
      const clients = await publicClient.readContract({
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getClients',
        args: [agentId],
      });
      if (!clients || clients.length === 0) return { count: 0, averageValue: 0, valueDecimals: 0 };
      const [count, summaryValue, summaryValueDecimals] = await publicClient.readContract({
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getSummary',
        args: [agentId, clients, '', ''],
      });
      const avg = Number(summaryValue) / Math.pow(10, Number(summaryValueDecimals));
      return { count: Number(count), averageValue: avg, valueDecimals: Number(summaryValueDecimals) };
    }
    const [count, summaryValue, summaryValueDecimals] = await publicClient.readContract({
      address: registryAddress,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [agentId, addresses, '', ''],
    });
    const avg = Number(summaryValue) / Math.pow(10, Number(summaryValueDecimals));
    return { count: Number(count), averageValue: avg, valueDecimals: Number(summaryValueDecimals) };
  } catch (err) {
    logger.warn('[Reputation] getFeedbackSummary failed', { error: err });
    return { count: 0, averageValue: 0, valueDecimals: 0 };
  }
}

/**
 * Read a single feedback entry from Reputation Registry (official readFeedback).
 */
export async function readAgentFeedback(
  agentId: bigint,
  clientAddress: string,
  feedbackIndex: bigint
): Promise<{ value: number; valueDecimals: number; tag1: string; tag2: string; isRevoked: boolean }> {
  const registryAddress = getReputationRegistryAddress();
  if (!registryAddress) throw new Error('ERC-8004 Reputation Registry not configured');
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004');
  const publicClient = createPublicClient({
    chain: getERC8004Chain(),
    transport: http(rpcUrl),
  });
  const [value, valueDecimals, tag1, tag2, isRevoked] = await publicClient.readContract({
    address: registryAddress,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'readFeedback',
    args: [agentId, clientAddress as `0x${string}`, feedbackIndex],
  });
  const numValue = Number(value) / Math.pow(10, Number(valueDecimals));
  return {
    value: numValue,
    valueDecimals: Number(valueDecimals),
    tag1: tag1 as string,
    tag2: tag2 as string,
    isRevoked: isRevoked as boolean,
  };
}

/**
 * Submit reputation attestation to DB. On-chain giveFeedback is not called here (agent cannot self-feedback per ERC-8004).
 */
export async function submitReputationAttestation(input: ReputationAttestationInput): Promise<string> {
  const txHash: string | undefined = input.txHash;

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
    logger.error('[Reputation] Failed to create attestation', { error });
    throw error;
  }
}

/**
 * Record execution outcome as reputation attestation (DB + optional on-chain).
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
 * Get aggregated reputation for an agent (DB first; if empty and registry set, try on-chain getSummary).
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
    if (attestations.length > 0) {
      const sum = attestations.reduce((s: number, a: { score: number }) => s + a.score, 0);
      return { averageScore: sum / attestations.length, count: total };
    }
    const onChain = await getFeedbackSummary(BigInt(agentOnChainId), []);
    if (onChain.count > 0) {
      return { averageScore: onChain.averageValue, count: onChain.count };
    }
    return { averageScore: 0, count: total };
  } catch {
    return { averageScore: 0, count: 0 };
  }
}
