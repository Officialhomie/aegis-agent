/**
 * Foundry Keystore - Secure agent wallet loading
 *
 * Loads the agent's private key from Foundry encrypted keystores (~/.foundry/keystores/)
 * via `cast wallet private-key`, or falls back to EXECUTE_WALLET_PRIVATE_KEY / AGENT_PRIVATE_KEY
 * for backward compatibility.
 *
 * Keys are never stored plaintext in .env when using keystore; only KEYSTORE_ACCOUNT
 * and KEYSTORE_PASSWORD are required (password + encrypted file are both needed to decrypt).
 */

import { spawnSync } from 'child_process';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { logger } from './logger';

let cachedHex: string | null = null;

export interface KeystoreStatus {
  available: boolean;
  method: 'keystore' | 'env_execute' | 'env_agent' | 'none';
  address?: string;
  error?: string;
}

/**
 * Check keystore availability without throwing.
 * Checks each method in priority order: keystore → env_execute → env_agent → none.
 */
export async function checkKeystoreAvailability(): Promise<KeystoreStatus> {
  const keystoreAccount = process.env.KEYSTORE_ACCOUNT?.trim();
  const password = process.env.KEYSTORE_PASSWORD ?? process.env.CAST_PASSWORD;
  const envExecuteKey = process.env.EXECUTE_WALLET_PRIVATE_KEY?.trim();
  const envAgentKey = process.env.AGENT_PRIVATE_KEY?.trim();

  // Try Foundry keystore first
  if (keystoreAccount && password !== undefined && password !== '') {
    try {
      const result = spawnSync(
        'cast',
        ['wallet', 'private-key', '--account', keystoreAccount],
        {
          encoding: 'utf-8',
          input: password,
          maxBuffer: 1024,
        }
      );
      const out = (result.stdout ?? '').trim();
      const err = (result.stderr ?? '').trim();

      if (result.status === 0) {
        const hex = out.startsWith('0x') ? out : `0x${out}`;
        if (/^0x[a-fA-F0-9]{64}$/.test(hex)) {
          const account = privateKeyToAccount(hex as `0x${string}`);
          return {
            available: true,
            method: 'keystore',
            address: account.address,
          };
        }
      }

      // Keystore failed, but don't throw - just log and try next method
      logger.warn('[Keystore] cast wallet private-key failed', {
        status: result.status,
        stderr: err.slice(0, 200),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn('[Keystore] Failed to load from Foundry keystore', { error: message });
    }
  }

  // Try EXECUTE_WALLET_PRIVATE_KEY
  if (envExecuteKey) {
    const hex = envExecuteKey.startsWith('0x') ? envExecuteKey : `0x${envExecuteKey}`;
    if (/^0x[a-fA-F0-9]{64}$/.test(hex)) {
      const account = privateKeyToAccount(hex as `0x${string}`);
      return {
        available: true,
        method: 'env_execute',
        address: account.address,
      };
    }
  }

  // Try AGENT_PRIVATE_KEY (legacy)
  if (envAgentKey) {
    const hex = envAgentKey.startsWith('0x') ? envAgentKey : `0x${envAgentKey}`;
    if (/^0x[a-fA-F0-9]{64}$/.test(hex)) {
      const account = privateKeyToAccount(hex as `0x${string}`);
      return {
        available: true,
        method: 'env_agent',
        address: account.address,
      };
    }
  }

  // No key available
  return {
    available: false,
    method: 'none',
    error: 'No signing key configured. Set KEYSTORE_ACCOUNT + KEYSTORE_PASSWORD or EXECUTE_WALLET_PRIVATE_KEY',
  };
}

/**
 * Resolve the agent private key hex: from Foundry keystore (cast) or from env.
 * Caches result for the process lifetime.
 */
async function resolvePrivateKeyHex(): Promise<string> {
  if (cachedHex) return cachedHex;

  const keystoreAccount = process.env.KEYSTORE_ACCOUNT?.trim();
  const password = process.env.KEYSTORE_PASSWORD ?? process.env.CAST_PASSWORD;
  const envKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;

  if (keystoreAccount && password !== undefined && password !== '') {
    try {
      const result = spawnSync(
        'cast',
        ['wallet', 'private-key', '--account', keystoreAccount],
        {
          encoding: 'utf-8',
          input: password,
          maxBuffer: 1024,
        }
      );
      const out = (result.stdout ?? '').trim();
      const err = (result.stderr ?? '').trim();
      if (result.status !== 0) {
        logger.error('[Keystore] cast wallet private-key failed', {
          status: result.status,
          stderr: err.slice(0, 200),
        });
        throw new Error(`cast wallet private-key failed: ${err || 'unknown'}`);
      }
      const hex = out.startsWith('0x') ? out : `0x${out}`;
      if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) {
        throw new Error('Invalid private key format from cast');
      }
      cachedHex = hex;
      return cachedHex;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('[Keystore] Failed to load from Foundry keystore', { error: message });
      throw e;
    }
  }

  if (envKey?.trim()) {
    const hex = envKey.startsWith('0x') ? envKey : `0x${envKey}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) {
      throw new Error('EXECUTE_WALLET_PRIVATE_KEY / AGENT_PRIVATE_KEY must be a 32-byte hex string');
    }
    cachedHex = hex;
    return cachedHex;
  }

  throw new Error(
    'Agent wallet not configured. Set KEYSTORE_ACCOUNT + KEYSTORE_PASSWORD (Foundry keystore) or EXECUTE_WALLET_PRIVATE_KEY / AGENT_PRIVATE_KEY'
  );
}

/**
 * Get the agent's viem PrivateKeyAccount from Foundry keystore or env.
 * Use this for all signing (paymaster, agentkit, identity, etc.).
 */
export async function getKeystoreAccount(): Promise<PrivateKeyAccount> {
  const hex = await resolvePrivateKeyHex();
  return privateKeyToAccount(hex as `0x${string}`);
}

/**
 * Get the agent's private key as hex (0x-prefixed). Use only when the key must be
 * passed to an external process (e.g. Botchan CLI). Prefer getKeystoreAccount() for in-process signing.
 */
export async function getPrivateKeyHex(): Promise<string> {
  return resolvePrivateKeyHex();
}

/** Reset in-memory cache (for tests only). */
export function __resetCacheForTesting(): void {
  cachedHex = null;
}
