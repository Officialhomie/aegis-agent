/**
 * Aegis Agent - Base Paymaster Execution
 *
 * Signs decisions, logs sponsorship to AegisActivityLogger, and integrates with
 * paymaster/bundler (Pimlico) for gas sponsorship via viem account-abstraction.
 * When BUNDLER_RPC_URL is set, executes paymaster sponsorship for the user's next UserOperation.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { recoverMessageAddress } from 'viem';
import { getKeystoreAccount } from '../../keystore';
import { base, baseSepolia } from 'viem/chains';
import { getPrisma } from '../../db';
import { uploadDecisionToIPFS } from '../../ipfs';
import { logger } from '../../logger';
import {
  getBundlerClient,
  getActiveBundlerRpcUrl,
  getEntryPointAddress,
  checkBundlerHealth,
  submitAndWaitForUserOp,
  estimateUserOpGas,
  type UserOpSubmissionResult,
  type BundlerHealthStatus,
} from './bundler-client';
import { signPaymasterApproval } from './paymaster-signer';
import { reserveAgentBudget, commitReservation, releaseReservation } from '../budget';
import { getNonce } from './nonce-manager';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { ExecutionResult } from './index';
import { updateCachedProtocolBudget, getCachedProtocolWhitelist } from '../../cache';
import { getEthPriceUSD } from '../observe/oracles';
import { buildExecuteCalldata, buildMdfCalldata, getActivityLoggerPingData } from './userop-calldata';
import { deserializeMdfDelegation } from '../../mdf';
import {
  deductDelegationBudget,
  rollbackDelegationBudget,
  recordDelegationUsage,
} from '../../delegation';
import { recordSponsorshipForRateLimits } from '../policy/rate-limit-utils';
import {
  findActiveGuarantee,
  recordGuaranteeUsage,
  checkGuaranteeCapacity,
  checkGasPriceConstraint,
  handleSlaBreach,
  checkSlaCompliance,
} from '../guarantees';

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
 * Uses atomic UPDATE with WHERE balanceUSD >= amountUSD to prevent TOCTOU race conditions.
 */
export async function deductProtocolBudget(
  protocolId: string,
  amountUSD: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getPrisma();

    // Atomic update: only succeeds if balanceUSD >= amountUSD (prevents race condition)
    const result = await db.$executeRaw`
      UPDATE "ProtocolSponsor"
      SET "balanceUSD" = "balanceUSD" - ${amountUSD},
          "totalSpent" = "totalSpent" + ${amountUSD},
          "sponsorshipCount" = "sponsorshipCount" + 1
      WHERE "protocolId" = ${protocolId}
        AND "balanceUSD" >= ${amountUSD}
    `;

    if (result === 0) {
      const existing = await db.protocolSponsor.findUnique({
        where: { protocolId },
        select: { balanceUSD: true },
      });
      if (!existing) {
        return { success: false, error: `Protocol ${protocolId} not found` };
      }
      return {
        success: false,
        error: `Insufficient budget: ${existing.balanceUSD} USD available, ${amountUSD} USD required`,
      };
    }

    const updated = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: { balanceUSD: true },
    });
    const newBalanceUSD = updated?.balanceUSD ?? 0;

    // Update cache (write-through strategy)
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

export interface PaymasterExecutionResult {
  paymasterReady: boolean;
  userOpHash?: string;
  transactionHash?: string;
  actualGasUsed?: string;
  error?: string;
  success?: boolean;
  simulationMode?: boolean;
}

/** Default gas limits used when estimation fails or for initial stub requests */
const DEFAULT_VERIFICATION_GAS_LIMIT = BigInt(150000);
const DEFAULT_PRE_VERIFICATION_GAS = BigInt(50000);
const GAS_BUFFER_MULTIPLIER = BigInt(150); // 150% = 1.5x buffer for safety
const GAS_BUFFER_DIVISOR = BigInt(100);

/**
 * Prepare paymaster sponsorship: estimate gas, get paymaster stub data, and store approval.
 * This is the first step - preparing the sponsorship data.
 * Actual UserOp submission happens via submitSponsoredUserOp.
 *
 * IMPORTANT: Gas estimation happens BEFORE requesting paymaster data to avoid
 * zero gas limit errors from the bundler/paymaster.
 */
export async function preparePaymasterSponsorship(params: {
  agentWallet: string;
  maxGasLimit: number;
  /** Real calldata for the UserOp (execute(target, value, data)); if omitted, stub uses 0x (may be rejected by CDP). */
  callData?: `0x${string}`;
  nonce?: bigint;
  /** Agent tier for ECDSA approval (1=ERC-8004, 2=ERC-4337, 3=smart contract). Defaults to 2. */
  agentTier?: 1 | 2 | 3;
}): Promise<{
  ready: boolean;
  paymasterData?: Hex;
  paymaster?: Address;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  estimatedGas?: {
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  };
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
  const { maxFeePerGas, maxPriorityFeePerGas } = getPaymasterFeeCaps();

  // Step 1: Estimate gas BEFORE requesting paymaster data
  // This is critical - zero gas limits will cause bundler simulation to fail
  let verificationGasLimit = DEFAULT_VERIFICATION_GAS_LIMIT;
  let preVerificationGas = DEFAULT_PRE_VERIFICATION_GAS;
  let callGasLimit = BigInt(params.maxGasLimit);

  try {
    logger.info('[Paymaster] Estimating gas for UserOperation...', {
      sender: params.agentWallet,
    });

    const gasEstimate = await estimateUserOpGas({
      sender: params.agentWallet as `0x${string}`,
      nonce: params.nonce ?? BigInt(0),
      callData,
      callGasLimit: BigInt(params.maxGasLimit),
      maxFeePerGas,
      maxPriorityFeePerGas,
      signature: '0x' as `0x${string}`, // Dummy signature for estimation
    });

    if (gasEstimate) {
      // Apply buffer to estimated values for safety (prevent OOG errors)
      verificationGasLimit = (gasEstimate.verificationGasLimit * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;
      preVerificationGas = (gasEstimate.preVerificationGas * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;
      callGasLimit = (gasEstimate.callGasLimit * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;

      logger.info('[Paymaster] Gas estimated successfully', {
        verificationGasLimit: verificationGasLimit.toString(),
        preVerificationGas: preVerificationGas.toString(),
        callGasLimit: callGasLimit.toString(),
      });
    } else {
      logger.warn('[Paymaster] Gas estimation returned null - using default values', {
        verificationGasLimit: verificationGasLimit.toString(),
        preVerificationGas: preVerificationGas.toString(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Paymaster] Gas estimation failed - using default values', {
      error: message,
      verificationGasLimit: verificationGasLimit.toString(),
      preVerificationGas: preVerificationGas.toString(),
    });
  }

  // Step 2: Sign paymaster approval with Aegis-owned AegisPaymaster.sol
  // Defaults: 150_000 gas for validation, 75_000 for postOp (same as paymaster-signer defaults)
  const PAYMASTER_VALIDATION_GAS = BigInt(150_000);
  const PAYMASTER_POSTOP_GAS = BigInt(75_000);

  try {
    const signed = await signPaymasterApproval({
      sender: params.agentWallet as Address,
      nonce: params.nonce ?? BigInt(0),
      callData,
      agentTier: params.agentTier ?? 2,
      validationGasLimit: PAYMASTER_VALIDATION_GAS,
      postOpGasLimit: PAYMASTER_POSTOP_GAS,
    });

    // Split paymasterAndData into viem v0.7 UserOp fields:
    //   [0:20]   paymaster address (40 hex chars)
    //   [20:36]  validationGasLimit (32 hex chars) - skip
    //   [36:52]  postOpGasLimit (32 hex chars) - skip
    //   [52:162] custom data (220 hex chars)
    const pad = signed.paymasterAndData;
    const paymasterAddress = `0x${pad.slice(2, 42)}` as Address;
    const paymasterCustomData = `0x${pad.slice(106)}` as Hex; // bytes 52-162

    logger.info('[Paymaster] Paymaster approval signed', {
      agentWallet: params.agentWallet,
      validUntil: signed.validUntil,
      agentTier: params.agentTier ?? 2,
    });

    return {
      ready: true,
      paymaster: paymasterAddress,
      paymasterData: paymasterCustomData,
      paymasterVerificationGasLimit: PAYMASTER_VALIDATION_GAS,
      paymasterPostOpGasLimit: PAYMASTER_POSTOP_GAS,
      estimatedGas: {
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
      },
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
  mode?: 'LIVE' | 'SIMULATION';
  agentTier?: 1 | 2 | 3;
}): Promise<PaymasterExecutionResult> {
  const mode = params.mode ?? 'LIVE';

  // Simulation mode: Skip actual execution, return mock success
  if (mode === 'SIMULATION') {
    logger.info('[Paymaster] Simulation mode - skipping actual bundler execution', {
      agentWallet: params.agentWallet,
    });

    return {
      paymasterReady: true,
      userOpHash: `0x${'0'.repeat(64)}` as `0x${string}`, // Mock hash
      transactionHash: `0x${'0'.repeat(64)}` as `0x${string}`, // Mock hash
      actualGasUsed: '100000', // Mock gas used
      success: true,
      simulationMode: true,
    };
  }

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

  // Prepare paymaster data: sign approval via Aegis-owned paymaster.
  // This also estimates gas - CRITICAL for avoiding zero gas limit errors.
  const prepared = await preparePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit: params.maxGasLimit,
    callData,
    nonce: params.nonce,
    agentTier: params.agentTier,
  });

  if (!prepared.ready) {
    return { paymasterReady: false, error: prepared.error };
  }

  const chain = getChain();
  const { maxFeePerGas, maxPriorityFeePerGas } = getPaymasterFeeCaps();

  // Use estimated gas values from preparePaymasterSponsorship, or defaults if not available
  const estimatedGas = prepared.estimatedGas ?? {
    callGasLimit: BigInt(params.maxGasLimit),
    verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
    preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
  };

  try {
    // Build the UserOperation with estimated gas values (NOT hardcoded zeros!)
    const userOp = {
      sender: params.agentWallet as `0x${string}`,
      nonce: params.nonce ?? BigInt(0),
      callData,
      callGasLimit: estimatedGas.callGasLimit,
      verificationGasLimit: estimatedGas.verificationGasLimit,
      preVerificationGas: estimatedGas.preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      signature: '0x' as `0x${string}`,
      // Paymaster fields: Aegis-owned AegisPaymaster with backend-signed approval
      ...(prepared.paymaster && { paymaster: prepared.paymaster }),
      ...(prepared.paymasterData && { paymasterData: prepared.paymasterData }),
      // v0.7 gas limits for the paymaster validation and postOp phases
      ...(prepared.paymasterVerificationGasLimit !== undefined && {
        paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit,
      }),
      ...(prepared.paymasterPostOpGasLimit !== undefined && {
        paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit,
      }),
    };

    logger.info('[Paymaster] Submitting sponsored UserOperation to bundler', {
      sender: params.agentWallet,
      callGasLimit: estimatedGas.callGasLimit.toString(),
      verificationGasLimit: estimatedGas.verificationGasLimit.toString(),
      preVerificationGas: estimatedGas.preVerificationGas.toString(),
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

  // Step 1: Upload decision to IPFS (non-blocking, for audit trail)
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
  // When target is ActivityLogger, use ping() so inner call succeeds; empty calldata reverts (no fallback)
  const innerData =
    targetContract &&
    activityLogger &&
    targetContract.toLowerCase() === activityLogger.toLowerCase()
      ? getActivityLoggerPingData()
      : ('0x' as `0x${string}`);
  // Check MDF mode: if delegation was upgraded to MDF, use redeemDelegations calldata
  const mdfDelegationRecord = params.delegationId
    ? await getPrisma().delegation.findUnique({
        where: { id: params.delegationId },
        select: { delegatorAccountType: true, serializedMdfDelegation: true },
      })
    : null;
  const isMdfMode = mdfDelegationRecord?.delegatorAccountType === 'DELEGATOR';

  let callData: `0x${string}` | undefined;
  if (isMdfMode && mdfDelegationRecord?.serializedMdfDelegation && targetContract) {
    try {
      const mdfDelegation = deserializeMdfDelegation(mdfDelegationRecord.serializedMdfDelegation);
      callData = buildMdfCalldata({ delegation: mdfDelegation, targetContract, value: BigInt(0), innerCalldata: innerData });
      logger.info('[Paymaster] MDF mode: built redeemDelegations calldata', { delegationId: params.delegationId });
    } catch (err) {
      logger.warn('[Paymaster] MDF calldata build failed — falling back to standard path', {
        error: err instanceof Error ? err.message : String(err),
        delegationId: params.delegationId,
      });
      callData = targetContract ? buildExecuteCalldata({ targetContract, value: BigInt(0), data: innerData }) : undefined;
    }
  } else {
    callData = targetContract ? buildExecuteCalldata({ targetContract, value: BigInt(0), data: innerData }) : undefined;
  }

  // Step 4: Get nonce from EntryPoint (prevents nonce collisions for same sender)
  let nonce: bigint | undefined;
  try {
    nonce = await getNonce(params.agentWallet as `0x${string}`);
  } catch (err) {
    logger.error('[Paymaster] Failed to get nonce from EntryPoint', {
      error: err instanceof Error ? err.message : String(err),
      agentWallet: params.agentWallet,
    });
    return {
      success: false,
      error: `Nonce lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      decisionHash: signed.decisionHash,
      signature: signed.signature,
    };
  }

  // Step 5: Reserve per-agent budget (atomic lock — prevents TOCTOU race)
  const agentTier = ((decision as any)._validatedTier as 1 | 2 | 3 | undefined) ?? 2;
  const reservation = await reserveAgentBudget(
    params.protocolId,
    params.agentWallet,
    params.estimatedCostUSD,
    agentTier
  );
  if (!reservation.reserved) {
    logger.warn('[Paymaster] Per-agent budget reservation failed', {
      protocolId: params.protocolId,
      agentWallet: params.agentWallet,
      agentTier,
      error: reservation.error,
    });
    return {
      success: false,
      error: `Agent budget reservation failed: ${reservation.error}`,
      decisionHash: signed.decisionHash,
      signature: signed.signature,
    };
  }

  // Step 5b: Execute paymaster sponsorship via bundler
  // IMPORTANT: Protocol budget deduction happens AFTER this succeeds.
  // Extract execution mode from decision (set by protocol-onboarding-status policy rule).
  const executionMode = (decision as any)._executionMode as 'LIVE' | 'SIMULATION' | undefined;
  const paymasterResult = await executePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit,
    callData,
    nonce,
    mode: executionMode,
    agentTier,
  });

  // Determine actual cost (use actual gas if available, otherwise estimate)
  const actualCostUSD = paymasterResult.actualGasUsed
    ? await calculateActualCostUSD(BigInt(paymasterResult.actualGasUsed))
    : params.estimatedCostUSD;

  // Step 6: Commit or release the per-agent budget reservation
  let onchainLogTxHash: string | undefined;
  if (paymasterResult.paymasterReady) {
    // Commit reservation with actual cost (UserOpSponsored event will also reconcile via event-listener)
    if (reservation.reservationId) {
      commitReservation(reservation.reservationId, {
        amountUSD: 0, // actual cost updated below after calculateActualCostUSD
        userOpHash: paymasterResult.userOpHash ?? '',
        txHash: paymasterResult.transactionHash,
      }).catch((err) => {
        logger.warn('[Paymaster] commitReservation failed (non-critical)', {
          reservationId: reservation.reservationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Log sponsorship on-chain (only after successful execution - prevents orphaned logs)
    const logResult = await logSponsorshipOnchain({
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      decisionHash: signed.decisionHash,
      estimatedCostUSD: params.estimatedCostUSD,
      metadata: JSON.stringify({
        reasoning: decision.reasoning.slice(0, 200),
        userOpHash: paymasterResult.userOpHash,
        txHash: paymasterResult.transactionHash,
      }),
    });
    onchainLogTxHash = logResult.txHash;
    if (!logResult.success) {
      logger.warn('[Paymaster] On-chain log failed after successful sponsorship', {
        error: logResult.error,
        userOpHash: paymasterResult.userOpHash,
      });
    }

    const budgetResult = await deductProtocolBudget(params.protocolId, actualCostUSD);
    if (!budgetResult.success) {
      logger.error('[Paymaster] Budget deduction failed after successful bundler submission', {
        protocolId: params.protocolId,
        gasCostUsd: actualCostUSD,
        txHash: onchainLogTxHash,
        userOpHash: paymasterResult.userOpHash,
        severity: 'CRITICAL',
        actionNeeded: 'Manual reconciliation required - sponsorship succeeded but budget not updated',
        error: budgetResult.error,
      });
    }

    // Step 5b: Handle delegation budget if delegationId is present
    if (params.delegationId) {
      const gasCostWei = paymasterResult.actualGasUsed
        ? BigInt(paymasterResult.actualGasUsed)
        : BigInt(maxGasLimit) * BigInt(1_000_000_000); // Estimate at 1 gwei

      // MDF path: on-chain caveats enforce budget — skip off-chain deduction
      if (!isMdfMode) {
        const delegationDeductResult = await deductDelegationBudget(params.delegationId, gasCostWei);
        if (!delegationDeductResult.success) {
          logger.error('[Paymaster] Delegation budget deduction failed', {
            delegationId: params.delegationId,
            gasCostWei: gasCostWei.toString(),
            error: delegationDeductResult.error,
            severity: 'HIGH',
          });
        }
      }

      // Record delegation usage (always — for analytics on both paths)
      await recordDelegationUsage({
        delegationId: params.delegationId,
        targetContract: targetContract ?? '0x0000000000000000000000000000000000000000',
        valueWei: BigInt(0),
        gasUsed: BigInt(paymasterResult.actualGasUsed ?? maxGasLimit),
        gasCostWei,
        txHash: paymasterResult.transactionHash,
        success: true,
      });

      logger.info('[Paymaster] Delegation usage recorded', {
        delegationId: params.delegationId,
        gasCostWei: gasCostWei.toString(),
        txHash: paymasterResult.transactionHash,
      });
    }

    // Step 5c: Record sponsorship for rate limits (only after successful execution)
    recordSponsorshipForRateLimits(params.agentWallet, params.protocolId).catch((err) => {
      logger.warn('[Paymaster] Rate limit record failed (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
        agentWallet: params.agentWallet,
        protocolId: params.protocolId,
      });
    });
  } else {
    logger.warn('[Paymaster] Bundler submission failed - budget NOT deducted', {
      protocolId: params.protocolId,
      estimatedCostUSD: params.estimatedCostUSD,
      error: paymasterResult.error,
      note: 'No on-chain log - sponsorship not executed',
    });

    // Release the per-agent budget reservation (no gas was consumed)
    if (reservation.reservationId) {
      releaseReservation(reservation.reservationId, 'bundler-submission-failed').catch((err) => {
        logger.warn('[Paymaster] releaseReservation failed (non-critical)', {
          reservationId: reservation.reservationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Rollback delegation budget if it was deducted optimistically (AEGIS path only)
    if (params.delegationId && !isMdfMode) {
      const estimatedGasWei = BigInt(maxGasLimit) * BigInt(1_000_000_000);
      await rollbackDelegationBudget(params.delegationId, estimatedGasWei);

      // Record failed usage
      await recordDelegationUsage({
        delegationId: params.delegationId,
        targetContract: targetContract ?? '0x0000000000000000000000000000000000000000',
        valueWei: BigInt(0),
        gasUsed: BigInt(0),
        gasCostWei: BigInt(0),
        success: false,
        errorMessage: paymasterResult.error,
      });
    }
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
        txHash: onchainLogTxHash ?? paymasterResult.transactionHash ?? null,
        signature: signed.signature,
        ipfsCid: ipfsCid ?? undefined,
      },
    });
    logger.info('[Paymaster] Sponsorship record created', {
      decisionHash: signed.decisionHash,
      txHash: onchainLogTxHash ?? paymasterResult.transactionHash,
      bundlerSuccess: paymasterResult.paymasterReady,
    });
  } catch (error) {
    logger.error('[Paymaster] FAILED to create sponsorship record - audit trail incomplete', {
      error,
      decisionHash: signed.decisionHash,
      txHash: onchainLogTxHash,
      protocolId: params.protocolId,
      severity: 'HIGH',
      impact: 'Audit trail incomplete - sponsorship not recorded in database',
    });
  }

  return {
    success: paymasterResult.paymasterReady,
    transactionHash: paymasterResult.transactionHash ?? onchainLogTxHash,
    sponsorshipHash: paymasterResult.userOpHash ?? onchainLogTxHash,
    decisionHash: signed.decisionHash,
    signature: signed.signature,
    paymasterReady: paymasterResult.paymasterReady,
    ipfsCid: ipfsCid ?? undefined,
    simulationResult: {
      action: 'SPONSOR_TRANSACTION',
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      onChainTxHash: onchainLogTxHash,
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
 * Uses ETH price from oracle (Chainlink/CoinGecko) with env fallback.
 */
async function calculateActualCostUSD(gasUsed: bigint): Promise<number> {
  const gasPriceWei = BigInt(process.env.GAS_PRICE_WEI ?? '1000000000');
  const gasCostWei = gasUsed * gasPriceWei;
  const gasCostETH = Number(gasCostWei) / 1e18;
  const ethPriceUSD = await getEthPriceUSD();
  return gasCostETH * ethPriceUSD;
}

/**
 * Get current gas price in wei
 */
function getCurrentGasPriceWei(): bigint {
  return BigInt(process.env.GAS_PRICE_WEI ?? '1000000000');
}

/**
 * Extended sponsorship result with guarantee info
 */
export interface GuaranteedSponsorshipResult extends SponsorshipExecutionResult {
  guaranteeId?: string;
  slaCompliant?: boolean;
  guaranteeUsed?: boolean;
}

/**
 * Execute SPONSOR_TRANSACTION with guarantee support.
 *
 * First checks for active guarantees for the agent. If found:
 * 1. Validates capacity and gas price constraints
 * 2. Executes with SLA tracking
 * 3. Records usage against guarantee
 * 4. Handles SLA breaches with auto-refunds
 *
 * Falls back to normal sponsorship if no guarantee found.
 */
export async function sponsorTransactionWithGuarantee(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION'
): Promise<GuaranteedSponsorshipResult> {
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

  // Check for active guarantee
  const guarantee = await findActiveGuarantee(params.agentWallet, params.protocolId);

  if (!guarantee) {
    // No guarantee - fall back to normal sponsorship
    const result = await sponsorTransaction(decision, mode);
    return { ...result, guaranteeUsed: false };
  }

  logger.info('[Paymaster] Found active guarantee for agent', {
    guaranteeId: guarantee.id,
    agentWallet: params.agentWallet,
    tier: guarantee.tier,
    type: guarantee.type,
  });

  // Validate guarantee capacity
  const capacityCheck = await checkGuaranteeCapacity(guarantee, params.estimatedCostUSD);
  if (!capacityCheck.hasCapacity) {
    logger.warn('[Paymaster] Guarantee capacity exhausted - falling back to normal sponsorship', {
      guaranteeId: guarantee.id,
      reason: capacityCheck.reason,
    });
    const result = await sponsorTransaction(decision, mode);
    return { ...result, guaranteeUsed: false };
  }

  // Validate gas price constraint
  const currentGasPrice = getCurrentGasPriceWei();
  const gasPriceCheck = checkGasPriceConstraint(guarantee, currentGasPrice);
  if (!gasPriceCheck.withinLimit) {
    logger.warn('[Paymaster] Gas price exceeds guarantee limit - falling back to normal sponsorship', {
      guaranteeId: guarantee.id,
      reason: gasPriceCheck.reason,
    });
    const result = await sponsorTransaction(decision, mode);
    return { ...result, guaranteeUsed: false };
  }

  // Execute with SLA tracking
  const submittedAt = new Date();

  // Sign decision
  const signed = await signDecision(decision);

  if (mode === 'SIMULATION') {
    return {
      success: true,
      guaranteeId: guarantee.id,
      guaranteeUsed: true,
      slaCompliant: true,
      simulationResult: {
        action: 'SPONSOR_TRANSACTION',
        agentWallet: params.agentWallet,
        protocolId: params.protocolId,
        decisionHash: signed.decisionHash,
        signature: signed.signature,
        message: 'Simulation: guaranteed sponsorship signed; execution skipped',
        guaranteeId: guarantee.id,
      },
      decisionHash: signed.decisionHash,
      signature: signed.signature,
    };
  }

  // Upload to IPFS
  let ipfsCid: string | undefined;
  const ipfsResult = await uploadDecisionToIPFS(signed.decisionJSON);
  if ('cid' in ipfsResult) {
    ipfsCid = ipfsResult.cid;
  }

  // Build calldata
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

  const innerData =
    targetContract &&
    activityLogger &&
    targetContract.toLowerCase() === activityLogger.toLowerCase()
      ? getActivityLoggerPingData()
      : ('0x' as `0x${string}`);
  const callData = targetContract
    ? buildExecuteCalldata({ targetContract, value: BigInt(0), data: innerData })
    : undefined;

  // Get nonce from EntryPoint
  let nonce: bigint;
  try {
    nonce = await getNonce(params.agentWallet as `0x${string}`);
  } catch (err) {
    logger.error('[Paymaster] Failed to get nonce for guarantee sponsorship', {
      error: err instanceof Error ? err.message : String(err),
      agentWallet: params.agentWallet,
    });
    return {
      success: false,
      error: `Nonce lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      decisionHash: signed.decisionHash,
      signature: signed.signature,
      guaranteeId: guarantee.id,
      guaranteeUsed: true,
    };
  }

  // Reserve per-agent budget before execution
  const agentTier = ((decision as any)._validatedTier as 1 | 2 | 3 | undefined) ?? 2;
  const reservation = await reserveAgentBudget(
    params.protocolId,
    params.agentWallet,
    params.estimatedCostUSD,
    agentTier
  );
  if (!reservation.reserved) {
    logger.warn('[Paymaster] Per-agent budget reservation failed (guarantee path)', {
      protocolId: params.protocolId,
      agentWallet: params.agentWallet,
      guaranteeId: guarantee.id,
      error: reservation.error,
    });
    return {
      success: false,
      error: `Agent budget reservation failed: ${reservation.error}`,
      decisionHash: signed.decisionHash,
      signature: signed.signature,
      guaranteeId: guarantee.id,
      guaranteeUsed: true,
    };
  }

  // Execute paymaster sponsorship
  const executionMode = (decision as any)._executionMode as 'LIVE' | 'SIMULATION' | undefined;
  const paymasterResult = await executePaymasterSponsorship({
    agentWallet: params.agentWallet,
    maxGasLimit,
    callData,
    nonce,
    mode: executionMode,
    agentTier,
  });

  const includedAt = paymasterResult.paymasterReady ? new Date() : undefined;
  const latencyMs = includedAt ? includedAt.getTime() - submittedAt.getTime() : undefined;

  // Calculate actual cost
  const actualCostUSD = paymasterResult.actualGasUsed
    ? await calculateActualCostUSD(BigInt(paymasterResult.actualGasUsed))
    : params.estimatedCostUSD;

  // Check SLA compliance
  let slaCompliant: boolean | undefined;
  if (paymasterResult.paymasterReady && latencyMs !== undefined) {
    const slaCheck = checkSlaCompliance(guarantee, latencyMs);
    slaCompliant = slaCheck.compliant;

    if (!slaCompliant && slaCheck.breach) {
      // Handle SLA breach
      logger.warn('[Paymaster] SLA breach detected', {
        guaranteeId: guarantee.id,
        latencyMs,
        maxLatencyMs: guarantee.maxLatencyMs,
      });

      await handleSlaBreach({
        guarantee,
        breachType: slaCheck.breach.type,
        breachDetails: {
          ...slaCheck.breach.details,
          userOpHash: paymasterResult.userOpHash,
        },
        costUsd: actualCostUSD,
      });
    }
  }

  // Record guarantee usage and log on-chain (only after successful execution)
  let guaranteeOnchainTxHash: string | undefined;
  if (paymasterResult.paymasterReady) {
    // Commit per-agent budget reservation
    if (reservation.reservationId) {
      commitReservation(reservation.reservationId, {
        amountUSD: 0,
        userOpHash: paymasterResult.userOpHash ?? '',
        txHash: paymasterResult.transactionHash,
      }).catch((err) => {
        logger.warn('[Paymaster] commitReservation failed (non-critical, guarantee path)', {
          reservationId: reservation.reservationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const logResult = await logSponsorshipOnchain({
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      decisionHash: signed.decisionHash,
      estimatedCostUSD: params.estimatedCostUSD,
      metadata: JSON.stringify({
        reasoning: decision.reasoning.slice(0, 200),
        guaranteeId: guarantee.id,
        tier: guarantee.tier,
        userOpHash: paymasterResult.userOpHash,
        txHash: paymasterResult.transactionHash,
      }),
    });
    guaranteeOnchainTxHash = logResult.txHash;
    if (!logResult.success) {
      logger.warn('[Paymaster] On-chain log failed after guarantee sponsorship', {
        error: logResult.error,
        guaranteeId: guarantee.id,
      });
    }

    try {
      await recordGuaranteeUsage({
        guaranteeId: guarantee.id,
        userOpHash: paymasterResult.userOpHash ?? guaranteeOnchainTxHash ?? signed.decisionHash,
        txHash: paymasterResult.transactionHash,
        gasUsed: BigInt(paymasterResult.actualGasUsed ?? maxGasLimit),
        gasPriceWei: currentGasPrice,
        costUsd: actualCostUSD,
        submittedAt,
        includedAt,
      });

      logger.info('[Paymaster] Guarantee usage recorded', {
        guaranteeId: guarantee.id,
        costUsd: actualCostUSD,
        slaCompliant,
      });

      recordSponsorshipForRateLimits(params.agentWallet, params.protocolId).catch((err) => {
        logger.warn('[Paymaster] Rate limit record failed (non-critical)', {
          error: err instanceof Error ? err.message : String(err),
          agentWallet: params.agentWallet,
          protocolId: params.protocolId,
        });
      });
    } catch (err) {
      logger.error('[Paymaster] Failed to record guarantee usage', {
        error: err,
        guaranteeId: guarantee.id,
        severity: 'HIGH',
      });
    }
  } else {
    // Release the per-agent budget reservation (no gas was consumed)
    if (reservation.reservationId) {
      releaseReservation(reservation.reservationId, 'bundler-submission-failed-guarantee-path').catch(
        (err) => {
          logger.warn('[Paymaster] releaseReservation failed (non-critical, guarantee path)', {
            reservationId: reservation.reservationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      );
    }
  }

  // Create sponsorship record
  try {
    const db = getPrisma();
    await db.sponsorshipRecord.create({
      data: {
        userAddress: params.agentWallet,
        protocolId: params.protocolId,
        decisionHash: signed.decisionHash,
        estimatedCostUSD: params.estimatedCostUSD,
        actualCostUSD: paymasterResult.paymasterReady ? actualCostUSD : null,
        txHash: guaranteeOnchainTxHash ?? paymasterResult.transactionHash ?? null,
        signature: signed.signature,
        ipfsCid: ipfsCid ?? undefined,
      },
    });
  } catch (err) {
    logger.error('[Paymaster] Failed to create sponsorship record', {
      error: err,
      severity: 'HIGH',
    });
  }

  return {
    success: paymasterResult.paymasterReady,
    transactionHash: paymasterResult.transactionHash ?? guaranteeOnchainTxHash,
    sponsorshipHash: paymasterResult.userOpHash ?? guaranteeOnchainTxHash,
    decisionHash: signed.decisionHash,
    signature: signed.signature,
    paymasterReady: paymasterResult.paymasterReady,
    ipfsCid,
    guaranteeId: guarantee.id,
    guaranteeUsed: true,
    slaCompliant,
    simulationResult: {
      action: 'SPONSOR_TRANSACTION',
      agentWallet: params.agentWallet,
      protocolId: params.protocolId,
      onChainTxHash: guaranteeOnchainTxHash,
      bundlerTxHash: paymasterResult.transactionHash,
      userOpHash: paymasterResult.userOpHash,
      paymasterReady: paymasterResult.paymasterReady,
      actualGasUsed: paymasterResult.actualGasUsed,
      ipfsCid,
      guaranteeId: guarantee.id,
      slaCompliant,
    },
  };
}
