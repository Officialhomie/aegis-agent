/**
 * Wallet operation mutex - serializes all on-chain wallet operations
 * to prevent nonce conflicts and concurrent signing when multiple modes run.
 */

import { getStateStore } from '../state-store';
import { logger } from '../../logger';

const LOCK_KEY = 'aegis:wallet_lock';
const LOCK_TTL_MS = 30_000;

/**
 * Execute an async operation while holding the wallet lock.
 * Retries acquiring the lock until timeout; releases lock in finally.
 */
export async function executeWithWalletLock<T>(
  operation: () => Promise<T>,
  timeoutMs: number = LOCK_TTL_MS
): Promise<T> {
  const store = await getStateStore();
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let acquired = false;
  const deadline = Date.now() + timeoutMs;

  while (!acquired && Date.now() < deadline) {
    acquired = await store.setNX(LOCK_KEY, lockId, { px: LOCK_TTL_MS });
    if (!acquired) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (!acquired) {
    logger.error('[WalletLock] Failed to acquire lock within timeout', { timeoutMs });
    throw new Error('Failed to acquire wallet lock');
  }

  try {
    return await operation();
  } finally {
    await store.set(LOCK_KEY, '', { px: 1 });
  }
}
