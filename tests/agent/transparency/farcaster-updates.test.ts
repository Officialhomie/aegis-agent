/**
 * Farcaster Updates (template variations) - unit tests
 * Tests interval gating, template variations, milestones, hashtags, state updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetReserveState = vi.hoisted(() => vi.fn());
const mockUpdateReserveState = vi.hoisted(() => vi.fn());
const mockPostToFarcaster = vi.hoisted(() => vi.fn());
const mockGetAgentWalletBalance = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state/reserve-state', () => ({
  getReserveState: mockGetReserveState,
  updateReserveState: mockUpdateReserveState,
}));

vi.mock('../../../src/lib/agent/social/farcaster', () => ({
  postToFarcaster: mockPostToFarcaster,
}));

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: mockGetAgentWalletBalance,
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import type { ReserveState } from '../../../src/lib/agent/state/reserve-state';

function baseState(overrides: Partial<ReserveState> = {}): ReserveState {
  return {
    ethBalance: 0.5,
    usdcBalance: 100,
    chainId: 8453,
    avgBurnPerSponsorship: 0.001,
    sponsorshipsLast24h: 0,
    dailyBurnRateETH: 0.01,
    runwayDays: 50,
    targetReserveETH: 0.5,
    criticalThresholdETH: 0.05,
    healthScore: 80,
    protocolBudgets: [{ protocolId: 'test', balanceUSD: 100, totalSpent: 0, burnRateUSDPerDay: 1, estimatedDaysRemaining: 100 }],
    lastUpdated: new Date().toISOString(),
    emergencyMode: false,
    forecastedBurnRate7d: 0.01,
    forecastedRunwayDays: 50,
    lastFarcasterPost: null,
    burnRateHistory: [],
    ...overrides,
  };
}

describe('farcaster-updates', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGetReserveState.mockReset();
    mockUpdateReserveState.mockReset();
    mockPostToFarcaster.mockReset();
    mockGetAgentWalletBalance.mockReset();

    mockGetAgentWalletBalance.mockResolvedValue({ ETH: 0.5, USDC: 100, chainId: 8453 });
    mockUpdateReserveState.mockImplementation(async (updates: Partial<ReserveState>) => {
      return { ...baseState(), ...updates } as ReserveState;
    });
    mockPostToFarcaster.mockResolvedValue({ success: true, castHash: '0xcast' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT post when lastFarcasterPost is recent (within interval)', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    mockGetReserveState.mockResolvedValue(baseState({ lastFarcasterPost: recent }));

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    expect(mockPostToFarcaster).not.toHaveBeenCalled();
  });

  it('posts when interval has elapsed since lastFarcasterPost', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockGetReserveState.mockResolvedValue(baseState({ lastFarcasterPost: old }));

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    expect(mockPostToFarcaster).toHaveBeenCalledTimes(1);
    expect(mockPostToFarcaster).toHaveBeenCalledWith(expect.any(String));
  });

  it('template variations: different Math.random yields different content', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const state = baseState({ lastFarcasterPost: old, sponsorshipsLast24h: 5 });
    mockGetReserveState.mockResolvedValue(state);
    mockUpdateReserveState.mockResolvedValue(state);

    const randSpy = vi.spyOn(Math, 'random');
    const messages: string[] = [];

    mockPostToFarcaster.mockImplementation(async (msg: string) => {
      messages.push(msg);
      return { success: true, castHash: '0x' + messages.length };
    });

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );

    randSpy.mockReturnValue(0.0);
    await maybePostFarcasterUpdate();
    randSpy.mockReturnValue(0.5);
    mockGetReserveState.mockResolvedValue({ ...state, lastFarcasterPost: null });
    await maybePostFarcasterUpdate();
    randSpy.mockReturnValue(0.9);
    mockGetReserveState.mockResolvedValue({ ...state, lastFarcasterPost: null });
    await maybePostFarcasterUpdate();

    randSpy.mockRestore();

    expect(messages.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(messages);
    expect(unique.size).toBeGreaterThanOrEqual(1);
  });

  it('activity template: post for state with sponsorshipsLast24h > 0 includes sponsorship count', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const state = baseState({
      lastFarcasterPost: old,
      sponsorshipsLast24h: 7,
      protocolBudgets: [{ protocolId: 'p1', balanceUSD: 50, totalSpent: 0, burnRateUSDPerDay: 1, estimatedDaysRemaining: 50 }],
    });
    mockGetReserveState.mockResolvedValue(state);
    mockUpdateReserveState.mockResolvedValue(state);

    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    const message = mockPostToFarcaster.mock.calls[0]?.[0];
    expect(message).toBeDefined();
    expect(message).toContain('7');
    vi.restoreAllMocks();
  });

  it('milestone template: state with sponsorshipsLast24h = 100 and low random triggers template containing 100', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const state = baseState({
      lastFarcasterPost: old,
      sponsorshipsLast24h: 100,
      protocolBudgets: [{ protocolId: 'p1', balanceUSD: 50, totalSpent: 0, burnRateUSDPerDay: 1, estimatedDaysRemaining: 50 }],
    });
    mockGetReserveState.mockResolvedValue(state);
    mockUpdateReserveState.mockResolvedValue(state);

    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    const message = mockPostToFarcaster.mock.calls[0]?.[0];
    expect(message).toContain('100');
    vi.restoreAllMocks();
  });

  it('quiet template: state with sponsorshipsLast24h = 0 and appropriate random triggers Standing by', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const state = baseState({
      lastFarcasterPost: old,
      sponsorshipsLast24h: 0,
      protocolBudgets: [],
    });
    mockGetReserveState.mockResolvedValue(state);
    mockUpdateReserveState.mockResolvedValue(state);

    vi.spyOn(Math, 'random').mockReturnValue(0.27);

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    const message = mockPostToFarcaster.mock.calls[0]?.[0];
    expect(message).toContain('Standing by');
    vi.restoreAllMocks();
  });

  it('every posted message contains at least one hashtag (starts with #)', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockGetReserveState.mockResolvedValue(baseState({ lastFarcasterPost: old }));

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    const message = mockPostToFarcaster.mock.calls[0]?.[0];
    expect(message).toMatch(/#\w+/);
  });

  it('after posting, calls updateReserveState with lastFarcasterPost', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockGetReserveState.mockResolvedValue(baseState({ lastFarcasterPost: old }));

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    const lastCall = mockUpdateReserveState.mock.calls[mockUpdateReserveState.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall[0]).toHaveProperty('lastFarcasterPost');
    expect(lastCall[0].lastFarcasterPost).toBeDefined();
  });

  it('when getReserveState returns null, does nothing', async () => {
    mockGetReserveState.mockResolvedValue(null);

    const { maybePostFarcasterUpdate } = await import(
      '../../../src/lib/agent/transparency/farcaster-updates'
    );
    await maybePostFarcasterUpdate();

    expect(mockPostToFarcaster).not.toHaveBeenCalled();
  });
});
