/**
 * Aegis Agent - UserOperation calldata builder for ERC-4337 smart accounts
 *
 * Encodes execute(to, value, data) calldata so CDP and other paymasters can
 * simulate a valid call. The sender (agentWallet) must be a 4337-compatible account.
 * When targeting ActivityLogger, use ping() so the inner call succeeds (empty calldata reverts).
 */

import { encodeFunctionData } from 'viem';

/** ABI for AegisActivityLogger.ping() - no-op callable by anyone, used for sponsored UserOps */
const ACTIVITY_LOGGER_PING_ABI = [
  { inputs: [], name: 'ping', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

/** Minimal ABI for IAccount / SimpleAccount execute(address to, uint256 value, bytes data) */
const EXECUTE_ABI = [
  {
    inputs: [
      { name: 'dest', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'func', type: 'bytes' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export interface BuildUserOpCalldataParams {
  /** Target contract address (must be allowlisted in protocol and CDP) */
  targetContract: `0x${string}`;
  /** ETH value to send (default 0 for no-op) */
  value?: bigint;
  /** Calldata for the target contract (default 0x for no-op) */
  data?: `0x${string}`;
}

/**
 * Build UserOperation callData for a 4337 account that uses execute(dest, value, func).
 * Use this so CDP simulation sees a valid call instead of empty calldata.
 */
/**
 * Encoded calldata for ActivityLogger.ping(). Use when target is ActivityLogger
 * so the inner call succeeds (empty calldata would revert - no fallback).
 */
export function getActivityLoggerPingData(): `0x${string}` {
  return encodeFunctionData({
    abi: ACTIVITY_LOGGER_PING_ABI,
    functionName: 'ping',
    args: [],
  });
}

/**
 * Build UserOperation callData for a 4337 account that uses execute(dest, value, func).
 * When targetContract is the ActivityLogger, pass data from getActivityLoggerPingData()
 * so CDP simulation sees a valid call (empty data reverts).
 */
export function buildExecuteCalldata(params: BuildUserOpCalldataParams): `0x${string}` {
  const value = params.value ?? BigInt(0);
  const data = params.data ?? ('0x' as `0x${string}`);
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [params.targetContract, value, data],
  });
}
