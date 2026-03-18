/**
 * Aegis Agent - Nonce Manager for ERC-4337 UserOperations
 *
 * Queries the EntryPoint contract's getNonce(sender, key) to obtain the correct
 * nonce for sponsored UserOps. Prevents nonce collisions when multiple sponsorships
 * target the same sender address.
 */

import type { Address } from 'viem';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { getEntryPointAddress } from './bundler-client';
import { logger } from '../../logger';

const ENTRY_POINT_GET_NONCE_ABI = [
  {
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    name: 'getNonce',
    outputs: [{ name: 'nonce', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function getRpcUrl(): string | undefined {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  if (networkId === 'base') {
    return process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL ?? process.env.RPC_URL_8453;
  }
  return (
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.RPC_URL_BASE_SEPOLIA ??
    process.env.RPC_URL_84532 ??
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE
  );
}

/**
 * Get the next nonce for a sender from the EntryPoint contract.
 * Uses key=0 for the default nonce sequence (ERC-4337 standard).
 *
 * @param sender - The UserOp sender address (agent wallet being sponsored)
 * @param key - Nonce key (default 0 for standard sequence)
 * @returns The current nonce value (use this for the next UserOp)
 */
export async function getNonce(sender: Address, key: bigint = BigInt(0)): Promise<bigint> {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl?.trim()) {
    throw new Error('RPC URL not configured - set BASE_RPC_URL or RPC_URL_BASE for nonce lookup');
  }
  const entryPoint = getEntryPointAddress();

  const data = encodeFunctionData({
    abi: ENTRY_POINT_GET_NONCE_ABI,
    functionName: 'getNonce',
    args: [sender, key],
  });

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        { to: entryPoint, data },
        'latest',
      ],
    }),
  });

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    throw new Error(`Nonce lookup failed: ${json.error.message}`);
  }
  const result = json.result as `0x${string}`;
  const nonce = decodeFunctionResult({
    abi: ENTRY_POINT_GET_NONCE_ABI,
    functionName: 'getNonce',
    data: result,
  });

  logger.debug('[NonceManager] Fetched nonce', {
    sender,
    key: key.toString(),
    nonce: nonce.toString(),
  });

  return nonce;
}
