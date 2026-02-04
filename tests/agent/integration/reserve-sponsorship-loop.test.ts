/**
 * Integration: full economic loop (x402 payment, budget allocation, sponsorship, burn tracking).
 * Lightweight: validates that key modules can be loaded and basic flows are wired.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 100, chainId: 8453 }),
}));

describe('Reserve Sponsorship Loop Integration', () => {
  it('updateReservesAfterSponsorship can be invoked without throwing', async () => {
    const { updateReservesAfterSponsorship } = await import('../../../src/lib/agent/execute/post-sponsorship');
    await expect(
      updateReservesAfterSponsorship(
        { success: true, gasUsed: BigInt(200000) },
        0.001
      )
    ).resolves.toBeUndefined();
  });

  it('getReserveState and updateReserveState are wired', async () => {
    const { getReserveState, updateReserveState } = await import('../../../src/lib/agent/state/reserve-state');
    await expect(updateReserveState({
      ethBalance: 0.5,
      usdcBalance: 100,
      chainId: 8453,
      sponsorshipsLast24h: 1,
    })).resolves.toBeDefined();
    const state = await getReserveState();
    expect(state === null || typeof state.ethBalance === 'number').toBe(true);
  });
});
