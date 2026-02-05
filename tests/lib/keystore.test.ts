/**
 * Keystore manager tests: env fallback and error when not configured.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getKeystoreAccount,
  getPrivateKeyHex,
  __resetCacheForTesting,
} from '../../src/lib/keystore';

const validHex = '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('keystore', () => {
  beforeEach(() => {
    __resetCacheForTesting();
    vi.unstubAllEnvs();
  });

  describe('getKeystoreAccount', () => {
    it('returns account when EXECUTE_WALLET_PRIVATE_KEY is set', async () => {
      vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
      const account = await getKeystoreAccount();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(account.type).toBe('local');
    });

    it('returns account when AGENT_PRIVATE_KEY is set (fallback)', async () => {
      vi.stubEnv('AGENT_PRIVATE_KEY', validHex);
      const account = await getKeystoreAccount();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('throws when no key is configured', async () => {
      await expect(getKeystoreAccount()).rejects.toThrow(
        /Agent wallet not configured/
      );
    });

    it('throws when hex is invalid', async () => {
      vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', '0xinvalid');
      await expect(getKeystoreAccount()).rejects.toThrow(/32-byte hex/);
    });
  });

  describe('getPrivateKeyHex', () => {
    it('returns same hex as used for account', async () => {
      vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
      const hex = await getPrivateKeyHex();
      expect(hex).toBe(validHex);
    });

    it('returns cached value on second call', async () => {
      vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
      const a = await getPrivateKeyHex();
      const b = await getPrivateKeyHex();
      expect(a).toBe(b);
    });

    it('throws when no key is configured', async () => {
      await expect(getPrivateKeyHex()).rejects.toThrow(
        /Agent wallet not configured/
      );
    });
  });

  describe('cache reset', () => {
    it('after reset, uses env again', async () => {
      vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
      await getKeystoreAccount();
      __resetCacheForTesting();
      delete process.env.EXECUTE_WALLET_PRIVATE_KEY;
      vi.stubEnv('AGENT_PRIVATE_KEY', validHex);
      const account = await getKeystoreAccount();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});
