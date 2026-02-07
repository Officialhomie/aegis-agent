/**
 * Safe signing wrappers: safeSign, safeLogOnchain, safeExecuteTransaction, requireSigningForOperation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCanSign = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/key-guard', () => ({
  canSign: () => mockCanSign(),
}));

import {
  safeSign,
  safeLogOnchain,
  safeExecuteTransaction,
  requireSigningForOperation,
} from '../../src/lib/safe-signing';

describe('Safe Signing', () => {
  beforeEach(() => {
    mockCanSign.mockReturnValue(true);
  });

  describe('safeSign', () => {
    it('calls signFn and returns result when canSign() is true', async () => {
      const signFn = vi.fn().mockResolvedValue({ signature: '0xabc' });
      const result = await safeSign('testSign', signFn, { data: 'x' });
      expect(signFn).toHaveBeenCalledWith({ data: 'x' });
      expect(result).toEqual({ signature: '0xabc' });
    });

    it('returns fallbackValue (default null) when canSign() is false', async () => {
      mockCanSign.mockReturnValue(false);
      const signFn = vi.fn();
      const result = await safeSign('testSign', signFn, { data: 'x' });
      expect(signFn).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns custom fallbackValue when specified and no key', async () => {
      mockCanSign.mockReturnValue(false);
      const signFn = vi.fn();
      const result = await safeSign('testSign', signFn, { data: 'x' }, { skipped: true });
      expect(signFn).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true });
    });

    it('propagates errors from signFn when canSign() is true', async () => {
      const signFn = vi.fn().mockRejectedValue(new Error('sign failed'));
      await expect(safeSign('testSign', signFn, { data: 'x' })).rejects.toThrow('sign failed');
    });
  });

  describe('safeLogOnchain', () => {
    it('calls logFn and returns tx hash when signing available', async () => {
      const logFn = vi.fn().mockResolvedValue('0xtxhash');
      const result = await safeLogOnchain('logSponsorship', logFn, { id: '1' });
      expect(logFn).toHaveBeenCalledWith({ id: '1' });
      expect(result).toBe('0xtxhash');
    });

    it('returns null when no key', async () => {
      mockCanSign.mockReturnValue(false);
      const logFn = vi.fn();
      const result = await safeLogOnchain('logSponsorship', logFn, { id: '1' });
      expect(logFn).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('propagates errors from logFn', async () => {
      const logFn = vi.fn().mockRejectedValue(new Error('rpc failed'));
      await expect(safeLogOnchain('logSponsorship', logFn, { id: '1' })).rejects.toThrow(
        'rpc failed'
      );
    });
  });

  describe('safeExecuteTransaction', () => {
    it('calls executeFn when signing available', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      const result = await safeExecuteTransaction('sponsor', executeFn, { tx: '0x' });
      expect(executeFn).toHaveBeenCalledWith({ tx: '0x' });
      expect(result).toEqual({ success: true });
    });

    it('returns null when no key', async () => {
      mockCanSign.mockReturnValue(false);
      const executeFn = vi.fn();
      const result = await safeExecuteTransaction('sponsor', executeFn, { tx: '0x' });
      expect(executeFn).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('propagates errors from executeFn', async () => {
      const executeFn = vi.fn().mockRejectedValue(new Error('tx reverted'));
      await expect(
        safeExecuteTransaction('sponsor', executeFn, { tx: '0x' })
      ).rejects.toThrow('tx reverted');
    });
  });

  describe('requireSigningForOperation', () => {
    it('returns true when key available', () => {
      expect(requireSigningForOperation('signDecision')).toBe(true);
    });

    it('returns false when no key and throwOnMissing is false', () => {
      mockCanSign.mockReturnValue(false);
      expect(requireSigningForOperation('signDecision', false)).toBe(false);
    });

    it('throws when no key and throwOnMissing is true', () => {
      mockCanSign.mockReturnValue(false);
      expect(() => requireSigningForOperation('signDecision', true)).toThrow(
        /Operation "signDecision" requires signing capability/
      );
    });
  });
});
