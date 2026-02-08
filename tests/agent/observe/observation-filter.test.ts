/**
 * Observation Filter - unit tests
 * Tests 6 change detectors, threshold edges, null previous, Redis ops.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import type { Observation } from '../../../src/lib/agent/observe';

function ts(): Date {
  return new Date();
}

function obs(data: Observation['data'], source: Observation['source'] = 'blockchain'): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: ts(),
    source,
    data,
  };
}

function gasObs(gwei: number): Observation {
  return obs({ gasPriceGwei: String(gwei) });
}

function lowGasObs(wallets: string[]): Observation {
  return obs({
    lowGasWallets: wallets.map((w) => ({ wallet: w })),
  });
}

function reservesObs(eth: number, usdc: number): Observation {
  return obs({ agentReserves: { eth, usdc } });
}

function protocolBudgetsObs(items: { protocolId: string; balanceUSD: number }[]): Observation {
  return obs({ protocolBudgets: items });
}

function failedTxsObs(count: number): Observation {
  return obs({ failedTransactions: Array(count).fill({}) });
}

describe('observation-filter', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  describe('hasSignificantChange', () => {
    it('returns false when current and previous are identical', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const same = [gasObs(1.5), reservesObs(0.2, 500)];
      expect(await hasSignificantChange(same, same)).toBe(false);
    });

    it('returns true when a new low-gas wallet appears', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [lowGasObs(['0xaaa'])];
      const curr = [lowGasObs(['0xaaa', '0xbbb'])];
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns true when ETH reserves drop >10%', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [reservesObs(0.2, 500)];
      const curr = [reservesObs(0.17, 500)]; // 15% drop
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns true when USDC reserves drop >10%', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [reservesObs(0.2, 1000)];
      const curr = [reservesObs(0.2, 890)]; // ~11% drop
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns true when protocol budget changes >15%', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 1000 }])];
      const curr = [protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 800 }])]; // 20% drop
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns true when gas price changes >0.5 Gwei', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [gasObs(1.0)];
      const curr = [gasObs(1.6)];
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns true when new failed transactions appear', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [failedTxsObs(0)];
      const curr = [failedTxsObs(2)];
      expect(await hasSignificantChange(curr, prev)).toBe(true);
    });

    it('returns false when changes are below all thresholds', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const prev = [
        gasObs(1.0),
        reservesObs(0.2, 1000),
        protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 1000 }]),
      ];
      const curr = [
        gasObs(1.3), // 0.3 Gwei change
        reservesObs(0.19, 950), // ~5% drop each
        protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 900 }]), // 10% drop
      ];
      expect(await hasSignificantChange(curr, prev)).toBe(false);
    });

    it('returns true when previous is null (first run)', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const curr = [gasObs(1.0)];
      expect(await hasSignificantChange(curr, null)).toBe(true);
    });

    it('returns true when previous is empty array', async () => {
      const { hasSignificantChange } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const curr = [gasObs(1.0)];
      expect(await hasSignificantChange(curr, [])).toBe(true);
    });
  });

  describe('savePreviousObservations', () => {
    it('calls set with key observations:previous', async () => {
      const { savePreviousObservations } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const observations = [gasObs(1.0)];
      await savePreviousObservations(observations);
      expect(mockSet).toHaveBeenCalledWith(
        'observations:previous',
        expect.any(String)
      );
      const arg = mockSet.mock.calls[0][1];
      expect(() => JSON.parse(arg)).not.toThrow();
    });
  });

  describe('getPreviousObservations', () => {
    it('calls get and parses JSON; returns null when no stored data', async () => {
      const { getPreviousObservations } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      mockGet.mockResolvedValue(null);
      const result = await getPreviousObservations();
      expect(result).toBe(null);
      expect(mockGet).toHaveBeenCalledWith('observations:previous');
    });

    it('returns parsed observations when data exists', async () => {
      const { getPreviousObservations } = await import(
        '../../../src/lib/agent/observe/observation-filter'
      );
      const stored = [
        {
          id: 'x',
          timestamp: new Date().toISOString(),
          source: 'blockchain',
          data: { gasPriceGwei: '1.5' },
        },
      ];
      mockGet.mockResolvedValue(JSON.stringify(stored));
      const result = await getPreviousObservations();
      expect(result).not.toBe(null);
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBe(1);
      expect(result![0].data).toEqual({ gasPriceGwei: '1.5' });
    });
  });
});
