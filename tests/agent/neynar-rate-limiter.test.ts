/**
 * Neynar Rate Limiter - unit tests
 * Tests budget enforcement, emergency bypass, auto-reset, Redis persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn(),
  }),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

const STATE_KEY = 'neynar:monthly:usage';

describe('NeynarRateLimiter', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGet.mockReset();
    mockSet.mockReset();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  async function getLimiter() {
    const { getNeynarRateLimiter } = await import(
      '../../src/lib/agent/social/neynar-rate-limiter'
    );
    return getNeynarRateLimiter();
  }

  it('canPost returns true when under category budget', async () => {
    const limiter = await getLimiter();
    expect(await limiter.canPost('proof')).toBe(true);
    expect(await limiter.canPost('stats')).toBe(true);
  });

  it('canPost returns false when category budget exhausted (e.g. 740 proofs)', async () => {
    const exhaustedState = {
      month: new Date().toISOString().slice(0, 7),
      used: { proof: 740, stats: 0, health: 0, emergency: 0 },
      total: 740,
      lastReset: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(JSON.stringify(exhaustedState));

    const limiter = await getLimiter();
    expect(await limiter.canPost('proof')).toBe(false);
    expect(await limiter.canPost('stats')).toBe(true);
  });

  it('canPost returns false when global monthly quota (1000) exhausted', async () => {
    const quotaState = {
      month: new Date().toISOString().slice(0, 7),
      used: { proof: 500, stats: 30, health: 180, emergency: 0 },
      total: 1000,
      lastReset: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(JSON.stringify(quotaState));

    const limiter = await getLimiter();
    expect(await limiter.canPost('proof')).toBe(false);
    expect(await limiter.canPost('stats')).toBe(false);
  });

  it('canPost always returns true for emergency category (bypass)', async () => {
    const quotaState = {
      month: new Date().toISOString().slice(0, 7),
      used: { proof: 740, stats: 30, health: 180, emergency: 50 },
      total: 1000,
      lastReset: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(JSON.stringify(quotaState));

    const limiter = await getLimiter();
    expect(await limiter.canPost('emergency')).toBe(true);
  });

  it('consumeToken increments both category and total counters', async () => {
    const limiter = await getLimiter();
    await limiter.consumeToken('proof');
    expect(mockSet).toHaveBeenCalledWith(
      STATE_KEY,
      expect.stringContaining('"proof":1')
    );
    expect(mockSet).toHaveBeenCalledWith(
      STATE_KEY,
      expect.stringContaining('"total":1')
    );

    mockSet.mockClear();
    await limiter.consumeToken('proof');
    const callArg = mockSet.mock.calls[0][1];
    const state = JSON.parse(callArg);
    expect(state.used.proof).toBe(2);
    expect(state.total).toBe(2);
  });

  it('auto-reset when month changes (in-memory reset, canPost and getUsageStats reflect zero)', async () => {
    const oldMonthState = {
      month: '2000-01',
      used: { proof: 100, stats: 5, health: 10, emergency: 0 },
      total: 115,
      lastReset: new Date().toISOString(),
    };
    mockGet.mockResolvedValue(JSON.stringify(oldMonthState));

    const limiter = await getLimiter();
    const canPost = await limiter.canPost('proof');
    expect(canPost).toBe(true);
    const stats = await limiter.getUsageStats();
    expect(stats.total).toBe(0);
    expect(stats.byCategory.proof.used).toBe(0);
  });

  it('getUsageStats returns accurate breakdown after mixed consumption', async () => {
    const limiter = await getLimiter();
    await limiter.consumeToken('proof');
    await limiter.consumeToken('proof');
    await limiter.consumeToken('stats');

    const stats = await limiter.getUsageStats();
    expect(stats.month).toMatch(/^\d{4}-\d{2}$/);
    expect(stats.total).toBe(3);
    expect(stats.quota).toBe(1000);
    expect(stats.remaining).toBe(997);
    expect(stats.byCategory.proof.used).toBe(2);
    expect(stats.byCategory.proof.budget).toBe(740);
    expect(stats.byCategory.stats.used).toBe(1);
    expect(stats.byCategory.stats.budget).toBe(30);
  });

  it('Redis persistence: set called with neynar:monthly:usage on saveState', async () => {
    const limiter = await getLimiter();
    await limiter.consumeToken('health');
    expect(mockSet).toHaveBeenCalledWith(
      STATE_KEY,
      expect.any(String)
    );
    expect(mockSet.mock.calls[0][0]).toBe(STATE_KEY);
  });

  it('Redis persistence: get called on loadState', async () => {
    const limiter = await getLimiter();
    await limiter.canPost('proof');
    expect(mockGet).toHaveBeenCalledWith(STATE_KEY);
  });

  it('reset() clears all state', async () => {
    const limiter = await getLimiter();
    await limiter.consumeToken('proof');
    mockSet.mockClear();
    await limiter.reset();
    expect(mockSet).toHaveBeenCalledWith(
      STATE_KEY,
      expect.stringContaining('"total":0')
    );
    const saved = JSON.parse(mockSet.mock.calls[0][1]);
    expect(saved.used.proof).toBe(0);
    expect(saved.used.stats).toBe(0);
  });
});
