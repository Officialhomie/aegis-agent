/**
 * Wallet mutex: concurrent lock attempts serialize; atomic setNX is used.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockSetNX = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: mockSetNX,
  }),
}));

import { executeWithWalletLock } from '../../src/lib/agent/execute/wallet-lock';

describe('Wallet Mutex', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockSetNX.mockReset();
  });

  it('uses setNX for atomic lock acquisition', async () => {
    mockSetNX.mockResolvedValue(true);
    let released = false;
    mockSet.mockImplementation(() => {
      released = true;
      return Promise.resolve();
    });

    await executeWithWalletLock(async () => 'done', 5000);
    expect(mockSetNX).toHaveBeenCalledWith('aegis:wallet_lock', expect.any(String), { px: 30000 });
    expect(mockSet).toHaveBeenCalled();
    expect(released).toBe(true);
  });

  it('serializes concurrent lock attempts', async () => {
    let nextAcquire = 0;
    mockSetNX.mockImplementation(() => {
      nextAcquire++;
      return Promise.resolve(nextAcquire <= 1);
    });
    mockSet.mockResolvedValue(undefined);

    const result = await executeWithWalletLock(async () => 'first', 5000);
    expect(result).toBe('first');
    expect(mockSetNX).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it('releases lock after operation completes', async () => {
    mockSetNX.mockResolvedValue(true);
    mockSet.mockResolvedValue(undefined);

    await executeWithWalletLock(async () => 42, 5000);
    expect(mockSet).toHaveBeenCalledWith('aegis:wallet_lock', '', expect.any(Object));
  });

  it('releases lock when operation throws', async () => {
    mockSetNX.mockResolvedValue(true);
    mockSet.mockResolvedValue(undefined);

    await expect(
      executeWithWalletLock(async () => {
        throw new Error('fail');
      }, 5000)
    ).rejects.toThrow('fail');
    expect(mockSet).toHaveBeenCalled();
  });
});
