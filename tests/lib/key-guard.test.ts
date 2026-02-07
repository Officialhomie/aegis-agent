/**
 * KeyGuard: signing capability management, initialization, requireSigning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCheckKeystoreAvailability = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/keystore', () => ({
  checkKeystoreAvailability: (...args: unknown[]) => mockCheckKeystoreAvailability(...args),
}));

import {
  initializeKeyGuard,
  getKeyGuardState,
  canSign,
  requireSigning,
  __resetForTesting,
} from '../../src/lib/key-guard';

describe('KeyGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    __resetForTesting();
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initializeKeyGuard', () => {
    it('returns canSign true and LIVE mode when key available and AGENT_MODE=LIVE', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'env_execute',
        address: '0x1234567890123456789012345678901234567890',
      });
      process.env.AGENT_MODE = 'LIVE';

      const state = await initializeKeyGuard();

      expect(state.canSign).toBe(true);
      expect(state.mode).toBe('LIVE');
      expect(state.method).toBe('env_execute');
      expect(state.address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('returns canSign true and SIMULATION mode when key available and AGENT_MODE=SIMULATION', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'keystore',
        address: '0xabc',
      });
      process.env.AGENT_MODE = 'SIMULATION';

      const state = await initializeKeyGuard();

      expect(state.canSign).toBe(true);
      expect(state.mode).toBe('SIMULATION');
      expect(state.method).toBe('keystore');
    });

    it('forces SIMULATION and canSign false when no key and LIVE requested', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: false,
        method: 'none',
        error: 'No signing key configured',
      });
      process.env.AGENT_MODE = 'LIVE';

      const state = await initializeKeyGuard();

      expect(state.canSign).toBe(false);
      expect(state.mode).toBe('SIMULATION');
      expect(state.method).toBe('none');
    });

    it('stays SIMULATION and canSign false when no key and SIMULATION requested', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: false,
        method: 'none',
      });
      process.env.AGENT_MODE = 'SIMULATION';

      const state = await initializeKeyGuard();

      expect(state.canSign).toBe(false);
      expect(state.mode).toBe('SIMULATION');
    });

    it('stays READONLY and canSign false when no key and READONLY requested', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: false,
        method: 'none',
      });
      process.env.AGENT_MODE = 'READONLY';

      const state = await initializeKeyGuard();

      expect(state.canSign).toBe(false);
      expect(state.mode).toBe('READONLY');
    });
  });

  describe('getKeyGuardState', () => {
    it('throws when not initialized', () => {
      expect(() => getKeyGuardState()).toThrow('KeyGuard not initialized');
    });

    it('returns state after initialization', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'env_execute',
        address: '0xabc',
      });
      await initializeKeyGuard();
      const state = getKeyGuardState();
      expect(state.canSign).toBe(true);
      expect(state.mode).toBeDefined();
    });
  });

  describe('canSign', () => {
    it('returns false before initialization', () => {
      expect(canSign()).toBe(false);
    });

    it('returns true after initialization with key', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'env_execute',
      });
      await initializeKeyGuard();
      expect(canSign()).toBe(true);
    });

    it('returns false after initialization without key', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: false,
        method: 'none',
      });
      await initializeKeyGuard();
      expect(canSign()).toBe(false);
    });
  });

  describe('requireSigning', () => {
    it('throws with descriptive message when no key', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: false,
        method: 'none',
      });
      await initializeKeyGuard();

      expect(() => requireSigning('signDecision')).toThrow(
        /Operation "signDecision" requires signing capability/
      );
      expect(() => requireSigning('signDecision')).toThrow(
        /KEYSTORE_ACCOUNT|EXECUTE_WALLET_PRIVATE_KEY/
      );
    });

    it('does not throw when key available', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'env_execute',
      });
      await initializeKeyGuard();

      expect(() => requireSigning('signDecision')).not.toThrow();
    });
  });

  describe('__resetForTesting', () => {
    it('resets state so getKeyGuardState throws again', async () => {
      mockCheckKeystoreAvailability.mockResolvedValue({
        available: true,
        method: 'env_execute',
      });
      await initializeKeyGuard();
      expect(getKeyGuardState()).toBeDefined();

      __resetForTesting();

      expect(() => getKeyGuardState()).toThrow('KeyGuard not initialized');
      expect(canSign()).toBe(false);
    });
  });
});
