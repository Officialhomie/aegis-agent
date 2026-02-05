/**
 * Aegis Agent - Base Paymaster Execution
 *
 * Signs decisions, logs sponsorship to AegisActivityLogger, and integrates with
 * paymaster/bundler (Pimlico) for gas sponsorship via viem account-abstraction.
 * When BUNDLER_RPC_URL is set, executes paymaster sponsorship for the user's next UserOperation.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { createPaymasterClient, getPaymasterStubData, entryPoint07Address } from 'viem/account-abstraction';
import { getStateStore } from '../state-store';
import { getPrisma } from '../../db';
import { uploadDecisionToIPFS } from '../../ipfs';
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
 * Log sponsorship to AegisActivityLogger contract on Base (for autonomous agent execution).
 */
export async function logSponsorshipOnchain(params: {
  agentWallet: string;
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
        params.agentWallet as `0x${string}`,
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
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getPrisma();
    await db.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: { decrement: amountUSD },
        totalSpent: { increment: amountUSD },
        sponsorshipCount: { increment: 1 },
      },
    });
    logger.info('[Paymaster] Budget deducted successfully', { protocolId, amountUSD });
    return { success: true };
  } catch (error) {
    logger.error('[Paymaster] FAILED to deduct protocol budget', {
      error,
      protocolId,
      amountUSD,
      severity: 'CRITICAL',
      impact: 'Budget tracking inconsistent - on-chain transaction succeeded but DB update failed',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

export interface SponsorshipExecutionResult extends ExecutionResult {
  decisionHash?: `0x${string}`;
  signature?: `0x${string}`;
  sponsorshipHash?: string;
  paymasterReady?: boolean;
  ipfsCid?: string;
}

/** TTL for paymaster approval (1 hour) so user's next UserOp can be sponsored */
const PAYMASTER_APPROVAL_TTL_MS = 60 * 60 * 1000;

/**
 * Execute paymaster sponsorship: get paymaster stub data for the agent and store approval
 * so the bundler can sponsor the agent's next UserOperation. Requires BUNDLER_RPC_URL (e.g. Pimlico).
 */
export async function executePaymasterSponsorship(params: {
  agentWallet: string;
  maxGasLimit: number;
}): Promise<{ paymasterReady: boolean; userOpHash?: string; error?: string }> {
  const rpcUrl = process.env.BUNDLER_RPC_URL ?? process.env.PAYMASTER_RPC_URL;
  if (!rpcUrl?.trim()) {
    logger.warn('[Paymaster] BUNDLER_RPC_URL not set - skipping paymaster execution');
    return { paymasterReady: false, error: 'BUNDLER_RPC_URL not set' };
  }

  const chain = getChain();
  const entryPoint = (process.env.ENTRY_POINT_ADDRESS as `0x${string}`) ?? entryPoint07Address;

  try {
    const paymasterClient = createPaymasterClient({
      transport: http(rpcUrl),
    });

    const stub = await getPaymasterStubData(paymasterClient, {
      chainId: chain.id,
      entryPointAddress: entryPoint,
      sender: params.agentWallet as `0x${string}`,
      nonce: BigInt(0),
      callData: '0x' as `0x${string}`,
      callGasLimit: BigInt(params.maxGasLimit),
    });

    if (!stub || (!('paymaster' in stub) && !('paymasterAndData' in stub))) {
      return { paymasterReady: false, error: 'No paymaster stub data returned' };
    }

    const store = await getStateStore();
    const key = `paymaster:approved:${params.agentWallet.toLowerCase()}`;
    await store.set(
      key,
      JSON.stringify({
        maxGasLimit: params.maxGasLimit,
        approvedAt: Date.now(),
      }),
      { px: PAYMASTER_APPROVAL_TTL_MS }
    );

    logger.info('[Paymaster] Paymaster sponsorship ready for agent', {
      agentWallet: params.agentWallet,
      maxGasLimit: params.maxGasLimit,
    });
    return { paymasterReady: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Paymaster] executePaymasterSponsorship failed', { error: message });
    return { paymasterReady: false, error: message };
  }
}

/**
 * Execute SPONSOR_TRANSACTION: sign decision, log on-chain, deduct protocol budget,
 * and in LIVE mode execute paymaster sponsorship (sponsors autonomous agent execution).
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
        agentWallet: params.agentWallet,
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
    agentWallet: params.agentWallet,
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

  const budgetResult = await deductProtocolBudget(params.protocolId, params.estimatedCostUSD);
  if (!budgetResult.success) {
    logger.error('[Paymaster] Budget deduction failed after on-chain transaction', {
      protocolId: params.protocolId,
      gasCostUsd: params.estimatedCostUSD,
      txHash: logResult.txHash,
      severity: 'CRITICAL',
      actionNeeded: 'Manual reconciliation required - transaction succeeded but budget not updated',
      error: budgetResult.error,
    });
  }

  let ipfsCid: string | undefined;
  const ipfsResult = await uploadDecisionToIPFS(signed.decisionJSON);
  if ('cid' in ipfsResult) {
    ipfsCid = ipfsResult.cid;
    logger.info('[Paymaster] Decision uploaded to IPFS', { cid: ipfsResult.cid });
  } else {
    if (ipfsResult.reason === 'not_configured') {
      logger.warn('[Paymaster] IPFS not configured - decision not backed up to immutable storage');
    } else {
      logger.error('[Paymaster] IPFS upload failed', {
        error: ipfsResult.error,
        reason: ipfsResult.reason,
        severity: 'HIGH',
        impact: 'Decision not backed up to immutable storage',
      });
    }
  }

  try {
    const db = getPrisma();
    await db.sponsorshipRecord.create({
      data: {
        userAddress: params.agentWallet, // DB column still 'userAddress' for now
        protocolId: params.protocolId,
        decisionHash: signed.decisionHash,
        estimatedCostUSD: params.estimatedCostUSD,
        txHash: logResult.txHash ?? null,
        signature: signed.signature,
        ipfsCid: ipfsCid ?? undefined,
      },
    });
    logger.info('[Paymaster] Sponsorship record created', {
      decisionHash: signed.decisionHash,
      txHash: logResult.txHash,
    });
  } catch (error) {
    logger.error('[Paymaster] FAILED to create sponsorship record - audit trail incomplete', {
      error,
      decisionHash: signed.decisionHash,
      txHash: logResult.txHash,
      protocolId: params.protocolId,
      severity: 'HIGH',
      impact: 'Audit trail incomplete - sponsorship not recorded in database',
    });
  }

  const maxGasLimit = params.maxGasLimit ?? 200_000;
  const paymasterResult = await executePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit,
  });

  return {
    success: true,
    transactionHash: logResult.txHash,
    sponsorshipHash: logResult.txHash,
    decisionHash: signed.decisionHash,
    signature: signed.signature,
    paymasterReady: paymasterResult.paymasterReady,
    ipfsCid: ipfsCid ?? undefined,
    simulationResult: {
      action: 'SPONSOR_TRANSACTION',
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      onChainTxHash: logResult.txHash,
      paymasterReady: paymasterResult.paymasterReady,
      ipfsCid: ipfsCid ?? undefined,
    },
  };
}
