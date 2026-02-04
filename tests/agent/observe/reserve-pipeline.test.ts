/**
 * Reserve pipeline observation tests: observeBurnRate, observeRunway, observePendingPayments, observeForecastedBurnRate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockDecisionCount = vi.hoisted(() => vi.fn());
const mockPaymentFindMany = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    decision: { count: mockDecisionCount },
    paymentRecord: { findMany: mockPaymentFindMany },
  }),
}));

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.3, USDC: 500, chainId: 8453 }),
}));

import {
  observeBurnRate,
  observeRunway,
  observePendingPayments,
  observeForecastedBurnRate,
} from '../../../src/lib/agent/observe/reserve-pipeline';

describe('Reserve Pipeline Observe', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        dailyBurnRateETH: 0.01,
        burnRateHistory: [],
        ethBalance: 0.3,
        usdcBalance: 500,
      })
    );
    mockDecisionCount.mockResolvedValue(5);
    mockPaymentFindMany.mockResolvedValue([]);
  });

  it('observeBurnRate returns observations with sponsorships and daily burn', async () => {
    const obs = await observeBurnRate();
    expect(Array.isArray(obs)).toBe(true);
    if (obs.length > 0) {
      expect(obs[0].data).toHaveProperty('sponsorshipsLast24h');
      expect(obs[0].data).toHaveProperty('dailyBurnRateETH');
    }
  });

  it('observeRunway returns runway days from reserve state', async () => {
    const obs = await observeRunway();
    expect(Array.isArray(obs)).toBe(true);
    expect(obs.length).toBeGreaterThan(0);
    expect(obs[0].data).toHaveProperty('runwayDays');
    expect(obs[0].data).toHaveProperty('ethBalance');
  });

  it('observePendingPayments returns empty when no pending', async () => {
    mockPaymentFindMany.mockResolvedValue([]);
    const obs = await observePendingPayments();
    expect(obs).toEqual([]);
  });

  it('observePendingPayments returns observations when payments exist', async () => {
    mockPaymentFindMany.mockResolvedValue([
      {
        paymentHash: '0xabc',
        amount: BigInt(100e6),
        currency: 'USDC',
        requester: '0x123',
      },
    ]);
    const obs = await observePendingPayments();
    expect(obs.length).toBeGreaterThan(0);
    expect(obs[0].data).toHaveProperty('pendingCount', 1);
  });

  it('observeForecastedBurnRate returns forecast or low confidence', async () => {
    const obs = await observeForecastedBurnRate();
    expect(Array.isArray(obs)).toBe(true);
    expect(obs[0].data).toHaveProperty('forecastedBurnRate7d');
  });
});
