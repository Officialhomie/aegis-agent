/**
 * Aegis Agent - Base Paymaster Execution
 *
 * Signs decisions, logs sponsorship to AegisActivityLogger, and integrates with
 * paymaster/bundler (Pimlico) for gas sponsorship via viem account-abstraction.
 * When BUNDLER_RPC_URL is set, executes paymaster sponsorship for the user's next UserOperation.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { recoverMessageAddress } from 'viem';
import { getKeystoreAccount } from '../../keystore';
import { base, baseSepolia } from 'viem/chains';
import { createPaymasterClient, getPaymasterStubData } from 'viem/account-abstraction';
import { getStateStore } from '../state-store';
import { getPrisma } from '../../db';
import { uploadDecisionToIPFS } from '../../ipfs';
import { logger } from '../../logger';
import {
  getBundlerClient,
  getActiveBundlerRpcUrl,
  getEntryPointAddress,
  checkBundlerHealth,
  submitAndWaitForUserOp,
  type UserOpSubmissionResult,
  type BundlerHealthStatus,
} from './bundler-client';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { ExecutionResult } from './index';
import { updateCachedProtocolBudget, getCachedProtocolWhitelist } from '../../cache';
import { buildExecuteCalldata } from './userop-calldata';

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

/**
 * Derive conservative gas fee caps for paymaster stubs.
 * Uses MAX_GAS_PRICE_GWEI when set, otherwise a low default suitable for tests.
 */
function getPaymasterFeeCaps(): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const maxGasPriceGwei = Number(process.env.MAX_GAS_PRICE_GWEI ?? '2');
  const baseGwei = Number.isFinite(maxGasPriceGwei) && maxGasPriceGwei > 0 ? maxGasPriceGwei : 2;
  const priorityGwei = Math.max(0.1, Math.min(baseGwei / 2, baseGwei));
  const gweiToWei = (gwei: number) => BigInt(Math.floor(gwei * 1e9));
  return {
    maxFeePerGas: gweiToWei(baseGwei),
    maxPriorityFeePerGas: gweiToWei(priorityGwei),
  };
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

async function getAgentAccount() {
  return getKeystoreAccount();
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
  const account = await getAgentAccount();
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

  const account = await getAgentAccount();
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

    // Get current budget first (needed for cache update)
    const current = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: { balanceUSD: true },
    });

    if (!current) {
      return { success: false, error: `Protocol ${protocolId} not found` };
    }

    const newBalanceUSD = current.balanceUSD - amountUSD;

    // Update database
    await db.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: newBalanceUSD,
        totalSpent: { increment: amountUSD },
        sponsorshipCount: { increment: 1 },
      },
    });

    // Update cache (write-through strategy)
    // Fire-and-forget - don't block on cache update
    updateCachedProtocolBudget(protocolId, newBalanceUSD, amountUSD).catch((err) => {
      logger.warn('[Paymaster] Cache update failed (non-critical)', {
        protocolId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info('[Paymaster] Budget deducted successfully', {
      protocolId,
      amountUSD,
      newBalance: newBalanceUSD,
    });
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

/**
 * Rollback a protocol budget deduction (for failed bundler submissions).
 * Use this when a sponsorship is logged on-chain but bundler submission fails.
 */
export async function rollbackProtocolBudget(
  protocolId: string,
  amountUSD: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getPrisma();
    await db.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: { increment: amountUSD },
        totalSpent: { decrement: amountUSD },
        sponsorshipCount: { decrement: 1 },
      },
    });
    logger.warn('[Paymaster] Budget rollback executed', {
      protocolId,
      amountUSD,
      reason,
      severity: 'HIGH',
      impact: 'Sponsorship failed after on-chain log - budget restored',
    });
    return { success: true };
  } catch (error) {
    logger.error('[Paymaster] FAILED to rollback protocol budget', {
      error,
      protocolId,
      amountUSD,
      reason,
      severity: 'CRITICAL',
      impact: 'Budget tracking permanently inconsistent - manual reconciliation required',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check bundler health status. Exported for use by circuit breaker.
 */
export async function getBundlerHealthStatus(): Promise<BundlerHealthStatus> {
  return checkBundlerHealth();
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

export interface PaymasterExecutionResult {
  paymasterReady: boolean;
  userOpHash?: string;
  transactionHash?: string;
  actualGasUsed?: string;
  error?: string;
}

/**
 * Prepare paymaster sponsorship: get paymaster stub data and store approval.
 * This is the first step - preparing the sponsorship data.
 * Actual UserOp submission happens via submitSponsoredUserOp.
 */
export async function preparePaymasterSponsorship(params: {
  agentWallet: string;
  maxGasLimit: number;
  /** Real calldata for the UserOp (execute(target, value, data)); if omitted, stub uses 0x (may be rejected by CDP). */
  callData?: `0x${string}`;
}): Promise<{
  ready: boolean;
  paymasterData?: `0x${string}`;
  paymaster?: `0x${string}`;
  error?: string;
}> {
  const rpcUrl = getActiveBundlerRpcUrl();
  if (!rpcUrl?.trim()) {
    logger.warn('[Paymaster] No bundler RPC URL (BUNDLER_RPC_URL or COINBASE_BUNDLER_RPC_URL with BUNDLER_PROVIDER=coinbase) - skipping paymaster preparation');
    return { ready: false, error: 'Bundler RPC URL not set' };
  }

  const chain = getChain();
  const entryPoint = getEntryPointAddress() as `0x${string}`;
  const callData = params.callData ?? ('0x' as `0x${string}`);

  try {
    const paymasterClient = createPaymasterClient({
      transport: http(rpcUrl),
    });

    const { maxFeePerGas, maxPriorityFeePerGas } = getPaymasterFeeCaps();

    const stub = await getPaymasterStubData(paymasterClient, {
      chainId: chain.id,
      entryPointAddress: entryPoint,
      sender: params.agentWallet as `0x${string}`,
      nonce: BigInt(0),
      callData,
      callGasLimit: BigInt(params.maxGasLimit),
      // Coinbase CDP requires EIP-1559 fee fields for pm_getPaymasterStubData
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    if (!stub || (!('paymaster' in stub) && !('paymasterAndData' in stub))) {
      return { ready: false, error: 'No paymaster stub data returned' };
    }

    // Store approval for reference
    const store = await getStateStore();
    const key = `paymaster:approved:${params.agentWallet.toLowerCase()}`;
    await store.set(
      key,
      JSON.stringify({
        maxGasLimit: params.maxGasLimit,
        approvedAt: Date.now(),
        stubData: stub,
      }),
      { px: PAYMASTER_APPROVAL_TTL_MS }
    );

    logger.info('[Paymaster] Paymaster sponsorship prepared', {
      agentWallet: params.agentWallet,
      maxGasLimit: params.maxGasLimit,
    });

    return {
      ready: true,
      paymasterData: 'paymasterAndData' in stub ? stub.paymasterAndData : undefined,
      paymaster: 'paymaster' in stub ? stub.paymaster : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Paymaster] preparePaymasterSponsorship failed', { error: message });
    return { ready: false, error: message };
  }
}

/**
 * Execute paymaster sponsorship by submitting a UserOperation to the bundler.
 * This is the actual execution step that submits to the bundler and waits for confirmation.
 *
 * IMPORTANT: This function actually submits the UserOp to the bundler.
 * Budget should only be deducted AFTER this function returns successfully.
 */
export async function executePaymasterSponsorship(params: {
  agentWallet: string;
  maxGasLimit: number;
  callData?: `0x${string}`;
  nonce?: bigint;
}): Promise<PaymasterExecutionResult> {
  const bundlerClient = getBundlerClient();
  if (!bundlerClient) {
    logger.warn('[Paymaster] BUNDLER_RPC_URL not set - skipping paymaster execution');
    return { paymasterReady: false, error: 'BUNDLER_RPC_URL not set' };
  }

  // First check bundler health
  const health = await checkBundlerHealth();
  if (!health.available) {
    logger.warn('[Paymaster] Bundler unavailable', { error: health.error });
    return { paymasterReady: false, error: health.error ?? 'Bundler unavailable' };
  }

  const callData = params.callData ?? ('0x' as `0x${string}`);

  // Prepare paymaster data with same callData we will send (required for CDP simulation)
  const prepared = await preparePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit: params.maxGasLimit,
    callData,
  });

  if (!prepared.ready) {
    return { paymasterReady: false, error: prepared.error };
  }

  const chain = getChain();
  const { maxFeePerGas, maxPriorityFeePerGas } = getPaymasterFeeCaps();

  try {
    // Build the UserOperation with same callData and fee caps as stub
    const userOp = {
      sender: params.agentWallet as `0x${string}`,
      nonce: params.nonce ?? BigInt(0),
      callData,
      callGasLimit: BigInt(params.maxGasLimit),
      verificationGasLimit: BigInt(100000),
      preVerificationGas: BigInt(21000),
      maxFeePerGas,
      maxPriorityFeePerGas,
      signature: '0x' as `0x${string}`,
      // Paymaster fields from prepared data
      ...(prepared.paymaster && { paymaster: prepared.paymaster }),
      ...(prepared.paymasterData && { paymasterData: prepared.paymasterData }),
    };

    logger.info('[Paymaster] Submitting sponsored UserOperation to bundler', {
      sender: params.agentWallet,
      maxGasLimit: params.maxGasLimit,
      chainId: chain.id,
    });

    // Submit to bundler and wait for confirmation
    const result: UserOpSubmissionResult = await submitAndWaitForUserOp(userOp as never);

    if (result.success) {
      logger.info('[Paymaster] Sponsored UserOperation confirmed', {
        userOpHash: result.userOpHash,
        transactionHash: result.transactionHash,
        actualGasUsed: result.actualGasUsed?.toString(),
      });

      return {
        paymasterReady: true,
        userOpHash: result.userOpHash,
        transactionHash: result.transactionHash,
        actualGasUsed: result.actualGasUsed?.toString(),
      };
    } else {
      logger.warn('[Paymaster] UserOperation submission failed', {
        error: result.error,
        userOpHash: result.userOpHash,
      });

      return {
        paymasterReady: false,
        userOpHash: result.userOpHash,
        error: result.error,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Paymaster] executePaymasterSponsorship failed', { error: message });
    return { paymasterReady: false, error: message };
  }
}

/**
 * Execute SPONSOR_TRANSACTION: sign decision, log on-chain, execute paymaster sponsorship,
 * and ONLY deduct protocol budget after bundler confirmation (sponsors autonomous agent execution).
 *
 * IMPORTANT: Budget is now deducted AFTER bundler confirmation, not before.
 * If bundler fails after on-chain log, budget is NOT deducted.
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

  // Step 1: Log sponsorship on-chain (immutable record)
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

  // Step 2: Upload decision to IPFS (non-blocking, for audit trail)
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

  // Step 3: Resolve target contract and build real UserOp calldata (so CDP simulation sees valid calls)
  const maxGasLimit = params.maxGasLimit ?? 200_000;
  const whitelist = await getCachedProtocolWhitelist(params.protocolId);
  const activityLogger = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}` | undefined;
  let targetContract: `0x${string}` | undefined;
  if (params.targetContract) {
    const normalized = params.targetContract.toLowerCase();
    if (whitelist.some((a) => a.toLowerCase() === normalized)) {
      targetContract = params.targetContract as `0x${string}`;
    }
  }
  if (!targetContract && whitelist.length > 0) {
    targetContract = whitelist[0] as `0x${string}`;
  }
  if (!targetContract && activityLogger) {
    targetContract = activityLogger;
  }
  const callData = targetContract
    ? buildExecuteCalldata({ targetContract, value: BigInt(0), data: '0x' })
    : undefined;

  // Step 4: Execute paymaster sponsorship via bundler
  // IMPORTANT: Budget deduction happens AFTER this succeeds
  const paymasterResult = await executePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit,
    callData,
  });

  // Determine actual cost (use actual gas if available, otherwise estimate)
  const actualCostUSD = paymasterResult.actualGasUsed
    ? calculateActualCostUSD(BigInt(paymasterResult.actualGasUsed))
    : params.estimatedCostUSD;

  // Step 5: ONLY deduct budget if bundler submission succeeded
  if (paymasterResult.paymasterReady) {
    const budgetResult = await deductProtocolBudget(params.protocolId, actualCostUSD);
    if (!budgetResult.success) {
      logger.error('[Paymaster] Budget deduction failed after successful bundler submission', {
        protocolId: params.protocolId,
        gasCostUsd: actualCostUSD,
        txHash: logResult.txHash,
        userOpHash: paymasterResult.userOpHash,
        severity: 'CRITICAL',
        actionNeeded: 'Manual reconciliation required - sponsorship succeeded but budget not updated',
        error: budgetResult.error,
      });
    }
  } else {
    logger.warn('[Paymaster] Bundler submission failed - budget NOT deducted', {
      protocolId: params.protocolId,
      estimatedCostUSD: params.estimatedCostUSD,
      txHash: logResult.txHash,
      error: paymasterResult.error,
      note: 'On-chain log exists but sponsorship not executed - protocol budget preserved',
    });
  }

  // Step 6: Create sponsorship record for audit trail
  try {
    const db = getPrisma();
    await db.sponsorshipRecord.create({
      data: {
        userAddress: params.agentWallet,
        protocolId: params.protocolId,
        decisionHash: signed.decisionHash,
        estimatedCostUSD: params.estimatedCostUSD,
        actualCostUSD: paymasterResult.paymasterReady ? actualCostUSD : null,
        txHash: logResult.txHash ?? null,
        signature: signed.signature,
        ipfsCid: ipfsCid ?? undefined,
      },
    });
    logger.info('[Paymaster] Sponsorship record created', {
      decisionHash: signed.decisionHash,
      txHash: logResult.txHash,
      bundlerSuccess: paymasterResult.paymasterReady,
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

  return {
    success: paymasterResult.paymasterReady,
    transactionHash: paymasterResult.transactionHash ?? logResult.txHash,
    sponsorshipHash: paymasterResult.userOpHash ?? logResult.txHash,
    decisionHash: signed.decisionHash,
    signature: signed.signature,
    paymasterReady: paymasterResult.paymasterReady,
    ipfsCid: ipfsCid ?? undefined,
    simulationResult: {
      action: 'SPONSOR_TRANSACTION',
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      onChainTxHash: logResult.txHash,
      bundlerTxHash: paymasterResult.transactionHash,
      userOpHash: paymasterResult.userOpHash,
      paymasterReady: paymasterResult.paymasterReady,
      actualGasUsed: paymasterResult.actualGasUsed,
      ipfsCid: ipfsCid ?? undefined,
    },
  };
}

/**
 * Calculate actual cost in USD from gas used.
 * Uses current ETH price from environment or reasonable default.
 */
function calculateActualCostUSD(gasUsed: bigint): number {
  // Get gas price (default 1 gwei = 10^9 wei)
  const gasPriceWei = BigInt(process.env.GAS_PRICE_WEI ?? '1000000000');
  // Calculate total gas cost in wei
  const gasCosstWei = gasUsed * gasPriceWei;
  // Convert to ETH (18 decimals)
  const gasCostETH = Number(gasCosstWei) / 1e18;
  // Get ETH price from env or use reasonable estimate
  const ethPriceUSD = Number(process.env.ETH_PRICE_USD ?? '2500');
  return gasCostETH * ethPriceUSD;
}
