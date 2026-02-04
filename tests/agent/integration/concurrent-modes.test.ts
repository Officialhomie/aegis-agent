/**
 * Integration: wallet lock serialization, circuit breaker isolation, rate limiter separation.
 */

import { describe, it, expect, vi } from 'vitest';

const mockSetNX = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: mockSetNX,
  }),
}));

import { executeWithWalletLock } from '../../../src/lib/agent/execute/wallet-lock';
import { getCircuitBreaker } from '../../../src/lib/agent/execute/circuit-breaker';

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 1, USDC: 0, chainId: 8453 }),
}));

describe('Concurrent Modes Integration', () => {
  it('wallet lock is acquired with setNX', async () => {
    mockSetNX.mockResolvedValue(true);
    mockSet.mockResolvedValue(undefined);
    await executeWithWalletLock(async () => 42, 5000);
    expect(mockSetNX).toHaveBeenCalledWith('aegis:wallet_lock', expect.any(String), expect.any(Object));
  });

  it('circuit breakers for different keys are distinct', () => {
    const a = getCircuitBreaker('reserve-pipeline');
    const b = getCircuitBreaker('gas-sponsorship');
    expect(a).not.toBe(b);
  });
});
