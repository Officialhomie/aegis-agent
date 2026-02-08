/**
 * Template Responses - unit tests
 * Tests 4 template scenarios, null fallback, param overrides, swap amount cap.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  getTemplateDecision,
  canUseTemplate,
} from '../../../src/lib/agent/reason/template-responses';
import type { Observation } from '../../../src/lib/agent/observe';

function obs(data: Observation['data']): Observation {
  return {
    id: 'obs-1',
    timestamp: new Date(),
    source: 'blockchain',
    data,
  };
}

function gasObs(gwei: number): Observation {
  return obs({ gasPriceGwei: String(gwei) });
}

function lowGasObs(count: number): Observation {
  return obs({
    lowGasWallets: Array.from({ length: count }, (_, i) => ({
      wallet: `0x${String(i).padStart(40, '0')}`,
    })),
  });
}

function reservesObs(eth: number, usdc: number): Observation {
  return obs({ agentReserves: { eth, usdc } });
}

function protocolBudgetsObs(items: { protocolId: string; balanceUSD: number }[]): Observation {
  return obs({ protocolBudgets: items });
}

describe('template-responses', () => {
  describe('getTemplateDecision', () => {
    it('returns WAIT with reason containing "gas" when gas >2 Gwei', () => {
      const observations = [gasObs(2.5)];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('WAIT');
      expect(decision!.reasoning.toLowerCase()).toContain('gas');
    });

    it('returns WAIT with reason containing "no opportunities" when 0 low-gas wallets', () => {
      const observations = [
        gasObs(1.0),
        reservesObs(0.2, 500),
        protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 100 }]),
      ];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('WAIT');
      expect(
        decision!.reasoning.toLowerCase().includes('no low-gas') ||
          decision!.reasoning.toLowerCase().includes('no opportunities')
      ).toBe(true);
    });

    it('returns SWAP_RESERVES when ETH <0.05 and USDC >=200; verifies parameters', () => {
      const observations = [
        reservesObs(0.03, 400),
        gasObs(1.0),
        lowGasObs(1),
      ];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('SWAP_RESERVES');
      expect(decision!.parameters).not.toBeNull();
      expect(decision!.parameters!.tokenIn).toBe('USDC');
      expect(decision!.parameters!.tokenOut).toBe('ETH');
      expect(decision!.parameters!.slippageTolerance).toBe(0.01);
      const amountIn = parseFloat(decision!.parameters!.amountIn as string);
      expect(amountIn).toBeGreaterThan(0);
      expect(amountIn).toBeLessThanOrEqual(200);
    });

    it('returns WAIT when reserves healthy (ETH >0.1, USDC >100) but <3 wallets', () => {
      const observations = [
        gasObs(1.0),
        reservesObs(0.15, 200),
        lowGasObs(2),
        protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 100 }]),
      ];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('WAIT');
      expect(decision!.reasoning.toLowerCase()).toMatch(/healthy|reserves|few/);
    });

    it('returns null when no template matches (e.g. 5 wallets, gas 1.5, reserves healthy)', () => {
      const observations = [
        gasObs(1.5),
        reservesObs(0.2, 500),
        lowGasObs(5),
        protocolBudgetsObs([{ protocolId: 'p1', balanceUSD: 100 }]),
      ];
      const decision = getTemplateDecision(observations);
      expect(decision).toBeNull();
    });

    it('custom gasPriceMaxGwei override works', () => {
      const observations = [
        gasObs(2.2),
        lowGasObs(5),
        reservesObs(0.2, 500),
      ];
      expect(getTemplateDecision(observations, 2)).not.toBeNull();
      expect(getTemplateDecision(observations, 2)!.action).toBe('WAIT');
      expect(getTemplateDecision(observations, 3)).toBeNull();
    });

    it('swap amount caps at min(200, usdc * 0.5)', () => {
      const observations = [reservesObs(0.02, 1000), lowGasObs(1)];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('SWAP_RESERVES');
      const amountIn = parseFloat(decision!.parameters!.amountIn as string);
      expect(amountIn).toBe(200);
    });

    it('swap amount is 50% of USDC when that is less than 200', () => {
      const observations = [reservesObs(0.02, 300), lowGasObs(1)];
      const decision = getTemplateDecision(observations);
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe('SWAP_RESERVES');
      const amountIn = parseFloat(decision!.parameters!.amountIn as string);
      expect(amountIn).toBe(150);
    });
  });

  describe('canUseTemplate', () => {
    it('returns true when getTemplateDecision !== null', () => {
      expect(canUseTemplate([gasObs(3.0)])).toBe(true);
      expect(canUseTemplate([reservesObs(0.02, 250)])).toBe(true);
    });

    it('returns false when getTemplateDecision === null', () => {
      const observations = [
        gasObs(1.5),
        reservesObs(0.2, 500),
        lowGasObs(5),
      ];
      expect(canUseTemplate(observations)).toBe(false);
    });
  });
});
