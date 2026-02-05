/**
 * Aegis Agent - ENS Primary Name (L2 Reverse Resolution)
 *
 * Sets reverse ENS (address -> name) for the agent wallet on Base so the
 * paymaster identity resolves to a human-readable name.
 * Uses L2 Reverse Registrar per ENSIP-19 (Base: 0x0000000000D8e504002cC26E3Ec46D81971C1664).
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { getKeystoreAccount } from '../../keystore';
import { logger } from '../../logger';

const REVERSE_REGISTRAR_BASE = '0x0000000000D8e504002cC26E3Ec46D81971C1664' as const;

const REVERSE_REGISTRAR_ABI = [
  {
    inputs: [{ name: 'name', type: 'string' }],
    name: 'setName',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_8453 ??
    'https://mainnet.base.org'
  );
}

/**
 * Set the primary ENS name (reverse record) for the agent wallet on Base.
 * Caller must control the wallet and the ENS name must already resolve to this address.
 *
 * @param ensName - Full ENS name (e.g. "aegis-paymaster.eth")
 * @returns Transaction hash or error
 */
export async function setPrimaryName(ensName: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  let account;
  try {
    account = await getKeystoreAccount();
  } catch {
    return { success: false, error: 'Agent wallet not configured (KEYSTORE_ACCOUNT+KEYSTORE_PASSWORD or EXECUTE_WALLET_PRIVATE_KEY)' };
  }

  const rpcUrl = getRpcUrl();

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    const hash = await walletClient.writeContract({
      address: REVERSE_REGISTRAR_BASE,
      abi: REVERSE_REGISTRAR_ABI,
      functionName: 'setName',
      args: [ensName],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[ENS] Primary name set', { ensName, txHash: hash });
    return { success: true, txHash: hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[ENS] setPrimaryName failed', { ensName, error: message });
    return { success: false, error: message };
  }
}

/**
 * Resolve the current primary name for an address on Base (read-only).
 * Full implementation would require resolver lookup (node -> name); currently a stub.
 */
export async function getPrimaryName(address: string): Promise<string | null> {
  void address; // stub: would resolve reverse record
  return null;
}
