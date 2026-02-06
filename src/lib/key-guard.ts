/**
 * Key Guard - Signing capability management
 *
 * Manages signing capability availability throughout the application.
 * Allows the agent to run in read-only/simulation mode when no private key is available.
 */

import { checkKeystoreAvailability, type KeystoreStatus } from './keystore';

export type AgentMode = 'LIVE' | 'SIMULATION' | 'READONLY';

export interface KeyGuardState {
  canSign: boolean;
  method: KeystoreStatus['method'];
  address?: string;
  mode: AgentMode;
}

let state: KeyGuardState | null = null;

/**
 * Initialize the KeyGuard system.
 * Checks key availability and determines the effective agent mode.
 * Call this once at application startup.
 */
export async function initializeKeyGuard(): Promise<KeyGuardState> {
  const keystoreStatus = await checkKeystoreAvailability();
  const requestedMode = (process.env.AGENT_MODE as AgentMode) || 'SIMULATION';

  if (!keystoreStatus.available) {
    // Force SIMULATION or READONLY when no key
    const fallbackMode = requestedMode === 'LIVE' ? 'SIMULATION' : requestedMode;
    state = {
      canSign: false,
      method: 'none',
      mode: fallbackMode as AgentMode,
    };
    console.warn('[KeyGuard] No signing key available, forcing non-LIVE mode');
    console.warn(`[KeyGuard] Running in ${fallbackMode} mode without signing capability`);
  } else {
    state = {
      canSign: true,
      method: keystoreStatus.method,
      address: keystoreStatus.address,
      mode: requestedMode,
    };
    console.log(`[KeyGuard] Signing key available via ${keystoreStatus.method}`);
    console.log(`[KeyGuard] Running in ${requestedMode} mode with signing capability`);
  }

  return state;
}

/**
 * Get the current KeyGuard state.
 * Throws if KeyGuard has not been initialized.
 */
export function getKeyGuardState(): KeyGuardState {
  if (!state) {
    throw new Error('KeyGuard not initialized. Call initializeKeyGuard() first.');
  }
  return state;
}

/**
 * Check if signing operations are available.
 */
export function canSign(): boolean {
  return state?.canSign ?? false;
}

/**
 * Require signing capability for an operation.
 * Throws if no signing key is available.
 */
export function requireSigning(operation: string): void {
  if (!canSign()) {
    throw new Error(
      `Operation "${operation}" requires signing capability, but no key is available. ` +
        `Configure KEYSTORE_ACCOUNT + KEYSTORE_PASSWORD or EXECUTE_WALLET_PRIVATE_KEY.`
    );
  }
}

/**
 * Reset state (for testing only).
 */
export function __resetForTesting(): void {
  state = null;
}
