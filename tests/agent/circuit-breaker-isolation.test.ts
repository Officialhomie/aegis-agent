/**
 * Circuit breaker isolation: keyed instances do not share state; Redis keys include mode prefix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 1, USDC: 0, chainId: 8453 }),
}));

import { getCircuitBreaker } from '../../src/lib/agent/execute/circuit-breaker';

describe('Circuit Breaker Isolation', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('returns different instances for different keys', () => {
    const a = getCircuitBreaker('reserve-pipeline');
    const b = getCircuitBreaker('gas-sponsorship');
    const c = getCircuitBreaker('reserve-pipeline');
    expect(a).toBe(c);
    expect(a).not.toBe(b);
  });

  it('persists state with key-prefixed store key', async () => {
    const breaker = getCircuitBreaker('my-mode', { failureThreshold: 2, windowMs: 1000, cooldownMs: 500 });
    await breaker.execute(async () => 'ok');
    expect(mockSet).toHaveBeenCalled();
    const [key] = mockSet.mock.calls[0];
    expect(key).toContain('aegis:circuit_breaker');
    expect(key).toContain('my-mode');
  });

  it('keyed instances do not share failure count', async () => {
    mockGet.mockResolvedValue(null);
    const reserve = getCircuitBreaker('iso-reserve', { failureThreshold: 2, windowMs: 60_000, cooldownMs: 1000 });
    const gas = getCircuitBreaker('iso-gas', { failureThreshold: 2, windowMs: 60_000, cooldownMs: 1000 });

    await reserve.execute(async () => {
      throw new Error('fail');
    }).catch(() => {});
    await reserve.execute(async () => {
      throw new Error('fail');
    }).catch(() => {});

    await expect(reserve.execute(async () => 'ok')).rejects.toThrow('Circuit breaker OPEN');
    await expect(gas.execute(async () => 'ok')).resolves.toBe('ok');
  });
});
