/**
 * Aegis Agent - Base Paymaster Execution
 *
 * Signs decisions, logs sponsorship to AegisActivityLogger, and integrates with
 * paymaster/bundler for gas sponsorship. Uses viem account-abstraction when
 * paymaster RPC is configured.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { logger } from '../../logger';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { ExecutionResult } from './index';

const ACTIVITY_LOGGER_ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'protocolId', type: 'string' },
      { name: 'decisionHash', type: 'bytes32' },
      { name: 'estimatedCostUSD', type: 'uint256' },
      { name: 'metadata', type: 'string' },
    ],
    name: 'logSponsorship',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenIn', type: 'string' },
      { name: 'tokenOut', type: 'string' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOut', type: 'uint256' },
      { name: 'decisionHash', type: 'bytes32' },
    ],
    name: 'logReserveSwap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'protocolId', type: 'string' },
      { name: 'alertType', type: 'string' },
      { name: 'decisionHash', type: 'bytes32' },
    ],
    name: 'logProtocolAlert',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export interface SignedDecision {
  decision: Decision;
  decisionHash: `0x${string}`;
  signature: `0x${string}`;
  decisionJSON: string;
}

const AGENT_VERSION = '2.0';

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

function getAgentAccount(): PrivateKeyAccount {
  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('EXECUTE_WALLET_PRIVATE_KEY or AGENT_PRIVATE_KEY required for paymaster');
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

/**
 * Generate decision hash (keccak256) and sign with agent wallet for non-repudiation.
 */
export async function signDecision(decision: Decision): Promise<SignedDecision> {
  const decisionJSON = JSON.stringify({
    decision,
    timestamp: Date.now(),
    agentVersion: AGENT_VERSION,
    preconditions: decision.preconditions,
  });
  const hash = keccak256(toHex(decisionJSON));
  const account = getAgentAccount();
  const signature = await account.signMessage({ message: { raw: hash } });
  return {
    decision,
    decisionHash: hash,
    signature,
    decisionJSON,
  };
}

/**
 * Verify decision signature (for audits).
 */
export async function verifyDecisionSignature(signedDecision: SignedDecision, expectedAgentAddress: string): Promise<boolean> {
  const recovered = await recoverMessageAddress({
    message: { raw: signedDecision.decisionHash },
    signature: signedDecision.signature,
  });
  return recovered.toLowerCase() === expectedAgentAddress.toLowerCase();
}

/**
 * Log sponsorship to AegisActivityLogger contract on Base.
 */
export async function logSponsorshipOnchain(params: {
  userAddress: string;
  protocolId: string;
  decisionHash: `0x${string}`;
  estimatedCostUSD: number;
  metadata?: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const contractAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}` | undefined;
  if (!contractAddress) {
    logger.warn('[Paymaster] ACTIVITY_LOGGER_ADDRESS not set - skipping on-chain log');
    return { success: true };
  }

  const account = getAgentAccount();
  const chain = getChain();
  const rpcUrl = getRpcUrl();
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ACTIVITY_LOGGER_ABI,
      functionName: 'logSponsorship',
      args: [
        params.userAddress as `0x${string}`,
        params.protocolId,
        params.decisionHash,
        BigInt(Math.round(params.estimatedCostUSD * 1e6)), // e.g. 0.08 USD as 80_000 (6 decimals)
        params.metadata ?? '',
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[Paymaster] Sponsorship logged on-chain', { txHash: hash });
    return { success: true, txHash: hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Paymaster] Failed to log sponsorship on-chain', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Deduct protocol budget from ProtocolSponsor (balanceUSD, totalSpent, sponsorshipCount).
 */
export async function deductProtocolBudget(
  protocolId: string,
  amountUSD: number
): Promise<{ success: boolean }> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    await db.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: { decrement: amountUSD },
        totalSpent: { increment: amountUSD },
        sponsorshipCount: { increment: 1 },
      },
    });
    return { success: true };
  } catch {
    return { success: true }; // non-fatal
  }
}

export interface SponsorshipExecutionResult extends ExecutionResult {
  decisionHash?: `0x${string}`;
  signature?: `0x${string}`;
  sponsorshipHash?: string;
}

/**
 * Execute SPONSOR_TRANSACTION: sign decision, log on-chain, deduct protocol budget.
 * Actual paymaster sponsorship (getPaymasterData) is done by the bundler when the user
 * submits a UserOperation; this path records the agent's decision and updates state.
 */
export async function sponsorTransaction(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION'
): Promise<SponsorshipExecutionResult> {
  if (decision.action !== 'SPONSOR_TRANSACTION') {
    return {
      success: false,
      error: `Expected SPONSOR_TRANSACTION, got ${decision.action}`,
    };
  }

  const params = decision.parameters as SponsorParams | null;
  if (!params) {
    return { success: false, error: 'SPONSOR_TRANSACTION requires parameters' };
  }

  const signed = await signDecision(decision);

  if (mode === 'SIMULATION') {
    return {
      success: true,
      simulationResult: {
        action: 'SPONSOR_TRANSACTION',
        userAddress: params.userAddress,
        protocolId: params.protocolId,
        decisionHash: signed.decisionHash,
        signature: signed.signature,
        message: 'Simulation: decision signed; on-chain log and paymaster submission skipped',
      },
      decisionHash: signed.decisionHash,
      signature: signed.signature,
    };
  }

  const logResult = await logSponsorshipOnchain({
    userAddress: params.userAddress,
    protocolId: params.protocolId,
    decisionHash: signed.decisionHash,
    estimatedCostUSD: params.estimatedCostUSD,
    metadata: JSON.stringify({ reasoning: decision.reasoning.slice(0, 200) }),
  });

  if (!logResult.success) {
    return {
      success: false,
      error: logResult.error,
      decisionHash: signed.decisionHash,
      signature: signed.signature,
    };
  }

  await deductProtocolBudget(params.protocolId, params.estimatedCostUSD);

  return {
    success: true,
    transactionHash: logResult.txHash,
    sponsorshipHash: logResult.txHash,
    decisionHash: signed.decisionHash,
    signature: signed.signature,
    simulationResult: {
      action: 'SPONSOR_TRANSACTION',
      userAddress: params.userAddress,
      protocolId: params.protocolId,
      onChainTxHash: logResult.txHash,
    },
  };
}
