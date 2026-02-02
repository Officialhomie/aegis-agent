/**
 * Aegis - Decision verification (on-chain + signature).
 * Used by dashboard API and scripts/verify-decision.ts.
 */

import { createPublicClient, http, type Hash } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { recoverMessageAddress } from 'viem';

const ACTIVITY_LOGGER_ABI = [
  {
    type: 'event',
    name: 'Sponsorship',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'protocolId', type: 'string', indexed: false },
      { name: 'decisionHash', type: 'bytes32', indexed: false },
      { name: 'estimatedCostUSD', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'metadata', type: 'string', indexed: false },
    ],
  },
] as const;

export interface VerifyResult {
  decisionHash: string;
  onChain: boolean;
  signatureValid: boolean;
  record?: {
    userAddress: string; // Agent wallet address (DB column still named userAddress)
    protocolId: string;
    estimatedCostUSD: number;
    txHash?: string;
    createdAt: string;
  };
  onChainEvent?: {
    user: string; // Agent wallet address (contract event still uses 'user' parameter)
    protocolId: string;
    estimatedCostUSD: bigint;
    timestamp: bigint;
    transactionHash: string;
  };
  error?: string;
}

function getChain() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_BASE_SEPOLIA ??
    'https://sepolia.base.org'
  );
}

/**
 * Verify a decision hash: 1) Query AegisActivityLogger for Sponsorship event,
 * 2) Optionally verify signature (recoverMessageAddress) if record has signature.
 */
export async function verifyDecisionChain(decisionHash: string): Promise<VerifyResult> {
  const result: VerifyResult = {
    decisionHash,
    onChain: false,
    signatureValid: false,
  };

  const contractAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}` | undefined;
  const expectedAgent = (process.env.AGENT_WALLET_ADDRESS ?? process.env.EXECUTE_WALLET_ADDRESS) as string | undefined;

  const publicClient = createPublicClient({
    chain: getChain(),
    transport: http(getRpcUrl()),
  });

  if (contractAddress) {
    try {
      const logs = await publicClient.getContractEvents({
        address: contractAddress,
        abi: ACTIVITY_LOGGER_ABI,
        eventName: 'Sponsorship',
        fromBlock: BigInt(0),
      });
      const normalizedHash = decisionHash.startsWith('0x') ? decisionHash : `0x${decisionHash}`;
      const event = logs.find(
        (e) => e.args.decisionHash && (e.args.decisionHash as Hash).toLowerCase() === normalizedHash.toLowerCase()
      );
      if (event && event.args.decisionHash) {
        result.onChain = true;
        result.onChainEvent = {
          user: event.args.user ?? '',
          protocolId: event.args.protocolId ?? '',
          estimatedCostUSD: event.args.estimatedCostUSD ?? BigInt(0),
          timestamp: event.args.timestamp ?? BigInt(0),
          transactionHash: event.transactionHash ?? '',
        };
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const record = await db.sponsorshipRecord.findUnique({ where: { decisionHash } });
    if (record) {
      result.record = {
        userAddress: record.userAddress,
        protocolId: record.protocolId,
        estimatedCostUSD: record.estimatedCostUSD,
        txHash: record.txHash ?? undefined,
        createdAt: record.createdAt.toISOString(),
      };
      if (expectedAgent && record.signature) {
        const recovered = await recoverMessageAddress({
          message: { raw: decisionHash.startsWith('0x') ? (decisionHash as `0x${string}`) : (`0x${decisionHash}` as `0x${string}`) },
          signature: record.signature as `0x${string}`,
        });
        result.signatureValid = recovered.toLowerCase() === expectedAgent.toLowerCase();
      }
    }
  } catch {
    // Prisma optional
  }

  return result;
}
