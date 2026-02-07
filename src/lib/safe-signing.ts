/**
 * Safe Signing Wrappers
 *
 * Provides safe wrappers around signing operations that gracefully handle
 * the case where no signing key is available. Operations that require signing
 * will be skipped with appropriate logging when no key is present.
 */

import { canSign } from './key-guard';
import { logger } from './logger';

/**
 * Safe wrapper for signing operations.
 * Returns null and logs a warning if no signing key is available.
 */
export async function safeSign<T, R>(
  operation: string,
  signFn: (input: T) => Promise<R>,
  input: T,
  fallbackValue: R | null = null
): Promise<R | null> {
  if (!canSign()) {
    logger.info(`[SafeSigning] Skipping ${operation} - no signing key available`);
    return fallbackValue;
  }

  try {
    return await signFn(input);
  } catch (error) {
    logger.error(`[SafeSigning] Error in ${operation}`, { error });
    throw error;
  }
}

/**
 * Safe wrapper for on-chain logging operations.
 * Returns null and logs if no signing key is available.
 */
export async function safeLogOnchain<T>(
  operation: string,
  logFn: (data: T) => Promise<string>,
  data: T
): Promise<string | null> {
  if (!canSign()) {
    logger.info(`[SafeSigning] Skipping on-chain log for ${operation} - no signing key available`);
    return null;
  }

  try {
    return await logFn(data);
  } catch (error) {
    logger.error(`[SafeSigning] Error logging ${operation} on-chain`, { error });
    throw error;
  }
}

/**
 * Safe wrapper for transaction operations.
 * Returns null and logs if no signing key is available.
 */
export async function safeExecuteTransaction<T, R>(
  operation: string,
  executeFn: (input: T) => Promise<R>,
  input: T
): Promise<R | null> {
  if (!canSign()) {
    logger.info(`[SafeSigning] Skipping ${operation} - no signing key available`);
    return null;
  }

  try {
    return await executeFn(input);
  } catch (error) {
    logger.error(`[SafeSigning] Error executing ${operation}`, { error });
    throw error;
  }
}

/**
 * Check if operation requires signing and warn/throw accordingly.
 */
export function requireSigningForOperation(operation: string, throwOnMissing = false): boolean {
  if (!canSign()) {
    const message = `Operation "${operation}" requires signing capability, but no key is available`;
    if (throwOnMissing) {
      throw new Error(message);
    }
    logger.warn(`[SafeSigning] ${message}`);
    return false;
  }
  return true;
}
