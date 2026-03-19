import type { Hex } from 'viem';
import type { UserOperation } from 'viem/account-abstraction';
import type { BundlerHealthStatus, UserOpSubmissionResult } from '../bundler-client';

export type { BundlerHealthStatus, UserOpSubmissionResult };

export interface GasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

export interface ReceiptOptions {
  timeout?: number;
  pollingInterval?: number;
}

export interface UserOpReceipt {
  transactionHash: Hex;
  actualGasUsed: bigint;
  success: boolean;
}

/**
 * Bundler abstraction interface.
 *
 * Implementations must be pure submission endpoints — no Aegis-specific
 * logic belongs here. Swap implementations by changing BUNDLER_PROVIDER.
 */
export interface IBundler {
  readonly name: string;
  checkHealth(): Promise<BundlerHealthStatus>;
  estimateGas(userOp: Partial<UserOperation<'0.7'>>): Promise<GasEstimate | null>;
  submit(userOp: UserOperation<'0.7'>): Promise<{ userOpHash: Hex }>;
  waitForReceipt(userOpHash: Hex, opts?: ReceiptOptions): Promise<UserOpReceipt>;
  submitAndWait(userOp: UserOperation<'0.7'>, opts?: ReceiptOptions): Promise<UserOpSubmissionResult>;
}
