/**
 * Reserve state CRUD tests (with mocked state store).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

describe('Reserve State', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getReserveState returns null when store has no key', async () => {
    mockGet.mockResolvedValue(null);
    const { getReserveState } = await import('../../src/lib/agent/state/reserve-state');
    const state = await getReserveState();
    expect(state).toBeNull();
  });

  it('getReserveState returns parsed state when store has value', async () => {
    const stored = {
      ethBalance: 0.5,
      usdcBalance: 100,
      chainId: 8453,
      healthScore: 80,
      lastUpdated: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(JSON.stringify(stored));
    const { getReserveState } = await import('../../src/lib/agent/state/reserve-state');
    const state = await getReserveState();
    expect(state).not.toBeNull();
    expect(state!.ethBalance).toBe(0.5);
    expect(state!.usdcBalance).toBe(100);
    expect(state!.healthScore).toBe(80);
    expect(state!.emergencyMode).toBe(false);
  });

  it('updateReserveState merges updates and persists', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        ethBalance: 0.3,
        usdcBalance: 50,
        chainId: 8453,
        dailyBurnRateETH: 0.01,
        targetReserveETH: 0.5,
        criticalThresholdETH: 0.05,
        lastUpdated: new Date().toISOString(),
      })
    );
    mockSet.mockResolvedValue(undefined);
    const { updateReserveState } = await import('../../src/lib/agent/state/reserve-state');
    const updated = await updateReserveState({ ethBalance: 0.4, sponsorshipsLast24h: 5 });
    expect(updated.ethBalance).toBe(0.4);
    expect(updated.sponsorshipsLast24h).toBe(5);
    expect(mockSet).toHaveBeenCalled();
  });
});
