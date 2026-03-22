import type { Hex } from 'viem';
import type { UserOperation } from 'viem/account-abstraction';
import {
  checkBundlerHealth,
  estimateUserOpGas,
  submitUserOperation,
  waitForUserOpReceipt,
  submitAndWaitForUserOp,
  getActiveBundlerRpcUrl,
} from '../bundler-client';
import type { IBundler, GasEstimate, ReceiptOptions, UserOpReceipt, BundlerHealthStatus, UserOpSubmissionResult } from './types';

/**
 * Default bundler adapter — delegates to the existing bundler-client.ts.
 *
 * This adapter exists so paymaster.ts depends on IBundler, not on bundler-client.ts
 * directly. Replacing the bundler requires only a new IBundler implementation.
 */
export class DefaultBundlerAdapter implements IBundler {
  get name(): string {
    const url = getActiveBundlerRpcUrl();
    return `pimlico${url ? '' : ' (unconfigured)'}`;
  }

  async checkHealth(): Promise<BundlerHealthStatus> {
    return checkBundlerHealth();
  }

  async estimateGas(userOp: Partial<UserOperation<'0.7'>>): Promise<GasEstimate | null> {
    return estimateUserOpGas(userOp);
  }

  async submit(userOp: UserOperation<'0.7'>): Promise<{ userOpHash: Hex }> {
    return submitUserOperation(userOp);
  }

  async waitForReceipt(userOpHash: Hex, opts?: ReceiptOptions): Promise<UserOpReceipt> {
    return waitForUserOpReceipt(userOpHash, opts);
  }

  async submitAndWait(userOp: UserOperation<'0.7'>, opts?: ReceiptOptions): Promise<UserOpSubmissionResult> {
    return submitAndWaitForUserOp(userOp, opts);
  }
}
