/**
 * Aegis Agent - Bundler Client for ERC-4337 UserOperation Submission
 *
 * Integrates with Pimlico bundler to submit UserOperations for gas sponsorship.
 * This module handles the actual submission of UserOps to the bundler, waiting
 * for receipts, and tracking submission status.
 */

import { createPublicClient, http, type Address, type Hex, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  createBundlerClient,
  entryPoint07Address,
  type UserOperation,
  type BundlerClient,
} from 'viem/account-abstraction';
import { logger } from '../../logger';

export class BundlerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundlerUnavailableError';
    Object.setPrototypeOf(this, BundlerUnavailableError.prototype);
  }
}

export class UserOpSubmissionError extends Error {
  public readonly userOpHash?: Hex;
  public readonly cause?: Error;

  constructor(message: string, opts?: { userOpHash?: Hex; cause?: Error }) {
    super(message);
    this.name = 'UserOpSubmissionError';
    this.userOpHash = opts?.userOpHash;
    this.cause = opts?.cause;
    Object.setPrototypeOf(this, UserOpSubmissionError.prototype);
  }
}

export interface BundlerConfig {
  bundlerRpcUrl: string;
  chain: Chain;
  entryPointAddress?: Address;
}

export interface UserOpSubmissionResult {
  success: boolean;
  userOpHash?: Hex;
  transactionHash?: Hex;
  actualGasUsed?: bigint;
  error?: string;
}

export interface BundlerHealthStatus {
  available: boolean;
  chainId?: number;
  supportedEntryPoints?: Address[];
  error?: string;
  latencyMs?: number;
}

function getChain(): Chain {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

/**
 * Resolve the active bundler/paymaster RPC URL from env.
 * When BUNDLER_PROVIDER=coinbase and COINBASE_BUNDLER_RPC_URL is set, use CDP; otherwise use Pimlico (BUNDLER_RPC_URL / PAYMASTER_RPC_URL).
 */
export function getActiveBundlerRpcUrl(): string | undefined {
  const provider = (process.env.BUNDLER_PROVIDER ?? 'pimlico').toLowerCase();
  const coinbaseUrl = process.env.COINBASE_BUNDLER_RPC_URL?.trim();
  if (provider === 'coinbase' && coinbaseUrl) {
    return coinbaseUrl;
  }
  return process.env.BUNDLER_RPC_URL ?? process.env.PAYMASTER_RPC_URL;
}

function getBundlerRpcUrl(): string | undefined {
  return getActiveBundlerRpcUrl();
}

/** Resolve entry point address from env; empty or unset uses ERC-4337 v0.7 default. */
export function getEntryPointAddress(): Address {
  const env = process.env.ENTRY_POINT_ADDRESS?.trim();
  return (env as Address) || entryPoint07Address;
}

let bundlerClientInstance: BundlerClient | null = null;

/**
 * Get or create a bundler client instance.
 * Returns null if BUNDLER_RPC_URL is not configured.
 */
export function getBundlerClient(): BundlerClient | null {
  const bundlerRpcUrl = getBundlerRpcUrl();
  if (!bundlerRpcUrl?.trim()) {
    return null;
  }

  if (bundlerClientInstance) {
    return bundlerClientInstance;
  }

  const chain = getChain();
  bundlerClientInstance = createBundlerClient({
    transport: http(bundlerRpcUrl),
    chain,
  });

  return bundlerClientInstance;
}

/**
 * Check if the bundler is available and responding.
 * Used by circuit breaker for health checks.
 */
export async function checkBundlerHealth(): Promise<BundlerHealthStatus> {
  const bundlerRpcUrl = getBundlerRpcUrl();
  if (!bundlerRpcUrl?.trim()) {
    return {
      available: false,
      error: 'BUNDLER_RPC_URL not configured',
    };
  }

  const startTime = Date.now();
  const chain = getChain();

  try {
    const client = getBundlerClient();
    if (!client) {
      return {
        available: false,
        error: 'Failed to create bundler client',
      };
    }

    // Check supported entry points - this validates bundler is responding
    const supportedEntryPoints = await client.request({
      method: 'eth_supportedEntryPoints' as never,
      params: [] as never,
    }) as Address[];

    const latencyMs = Date.now() - startTime;
    const entryPoint = getEntryPointAddress();
    const supportsOurEntryPoint = supportedEntryPoints.some(
      (ep) => ep.toLowerCase() === entryPoint.toLowerCase()
    );

    if (!supportsOurEntryPoint) {
      logger.warn('[BundlerClient] Bundler does not support our entry point', {
        ourEntryPoint: entryPoint,
        supportedEntryPoints,
      });
      return {
        available: false,
        chainId: chain.id,
        supportedEntryPoints,
        error: `Bundler does not support entry point ${entryPoint}`,
        latencyMs,
      };
    }

    logger.debug('[BundlerClient] Health check passed', {
      chainId: chain.id,
      latencyMs,
      supportedEntryPoints,
    });

    return {
      available: true,
      chainId: chain.id,
      supportedEntryPoints,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[BundlerClient] Health check failed', {
      error: message,
      latencyMs,
    });
    return {
      available: false,
      error: message,
      latencyMs,
    };
  }
}

/**
 * Estimate gas for a UserOperation via the bundler.
 */
export async function estimateUserOpGas(userOp: Partial<UserOperation<'0.7'>>): Promise<{
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
} | null> {
  const client = getBundlerClient();
  if (!client) {
    logger.warn('[BundlerClient] Cannot estimate gas - bundler not configured');
    return null;
  }

  try {
    const estimate = await client.request({
      method: 'eth_estimateUserOperationGas' as never,
      params: [userOp, getEntryPointAddress()] as never,
    }) as {
      callGasLimit: Hex;
      verificationGasLimit: Hex;
      preVerificationGas: Hex;
    };

    return {
      callGasLimit: BigInt(estimate.callGasLimit),
      verificationGasLimit: BigInt(estimate.verificationGasLimit),
      preVerificationGas: BigInt(estimate.preVerificationGas),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[BundlerClient] Gas estimation failed', { error: message });
    return null;
  }
}

/**
 * Submit a UserOperation to the bundler.
 * Returns the userOpHash immediately upon submission.
 */
export async function submitUserOperation(
  userOp: UserOperation<'0.7'>
): Promise<{ userOpHash: Hex }> {
  const client = getBundlerClient();
  if (!client) {
    throw new BundlerUnavailableError('BUNDLER_RPC_URL not configured');
  }

  logger.info('[BundlerClient] Submitting UserOperation', {
    sender: userOp.sender,
    nonce: userOp.nonce?.toString(),
  });

  try {
    const userOpHash = await client.request({
      method: 'eth_sendUserOperation' as never,
      params: [userOp, getEntryPointAddress()] as never,
    }) as Hex;

    logger.info('[BundlerClient] UserOperation submitted', {
      userOpHash,
      sender: userOp.sender,
    });

    return { userOpHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[BundlerClient] UserOperation submission failed', {
      error: message,
      sender: userOp.sender,
    });
    throw new UserOpSubmissionError(`Failed to submit UserOperation: ${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Wait for a UserOperation to be included in a transaction.
 * Returns the transaction receipt once confirmed.
 */
export async function waitForUserOpReceipt(
  userOpHash: Hex,
  options?: {
    timeout?: number;
    pollingInterval?: number;
  }
): Promise<{
  transactionHash: Hex;
  actualGasUsed: bigint;
  success: boolean;
}> {
  const client = getBundlerClient();
  if (!client) {
    throw new BundlerUnavailableError('BUNDLER_RPC_URL not configured');
  }

  const timeout = options?.timeout ?? 120_000; // 2 minutes default
  const pollingInterval = options?.pollingInterval ?? 2_000; // 2 seconds
  const startTime = Date.now();

  logger.info('[BundlerClient] Waiting for UserOperation receipt', {
    userOpHash,
    timeout,
  });

  while (Date.now() - startTime < timeout) {
    try {
      const receipt = await client.request({
        method: 'eth_getUserOperationReceipt' as never,
        params: [userOpHash] as never,
      }) as {
        receipt: {
          transactionHash: Hex;
          gasUsed: Hex;
        };
        success: boolean;
        actualGasUsed: Hex;
      } | null;

      if (receipt) {
        const actualGasUsed = BigInt(receipt.actualGasUsed);
        logger.info('[BundlerClient] UserOperation confirmed', {
          userOpHash,
          transactionHash: receipt.receipt.transactionHash,
          actualGasUsed: actualGasUsed.toString(),
          success: receipt.success,
        });

        return {
          transactionHash: receipt.receipt.transactionHash,
          actualGasUsed,
          success: receipt.success,
        };
      }
    } catch (error) {
      // Receipt not available yet, continue polling
      logger.debug('[BundlerClient] Receipt not yet available', {
        userOpHash,
        elapsed: Date.now() - startTime,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }

  throw new UserOpSubmissionError(
    `Timeout waiting for UserOperation receipt after ${timeout}ms`,
    { userOpHash }
  );
}

/**
 * Submit a UserOperation and wait for confirmation.
 * This is the main function used by the paymaster for sponsored transactions.
 */
export async function submitAndWaitForUserOp(
  userOp: UserOperation<'0.7'>,
  options?: {
    timeout?: number;
    pollingInterval?: number;
  }
): Promise<UserOpSubmissionResult> {
  try {
    // First, verify bundler is available
    const health = await checkBundlerHealth();
    if (!health.available) {
      return {
        success: false,
        error: health.error ?? 'Bundler unavailable',
      };
    }

    // Submit the UserOperation
    const { userOpHash } = await submitUserOperation(userOp);

    // Wait for confirmation
    const receipt = await waitForUserOpReceipt(userOpHash, options);

    return {
      success: receipt.success,
      userOpHash,
      transactionHash: receipt.transactionHash,
      actualGasUsed: receipt.actualGasUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const userOpHash = error instanceof UserOpSubmissionError ? error.userOpHash : undefined;

    logger.error('[BundlerClient] submitAndWaitForUserOp failed', {
      error: message,
      userOpHash,
    });

    return {
      success: false,
      userOpHash,
      error: message,
    };
  }
}

/**
 * Reset the bundler client instance (for testing or reconnection).
 */
export function resetBundlerClient(): void {
  bundlerClientInstance = null;
}
