/**
 * Reserve policy rules: min-usdc-buffer, max-replenish-amount, emergency-halt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: vi.fn(),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

import { reservePolicyRules } from '../../../src/lib/agent/policy/reserve-rules';
import type { Decision } from '../../../src/lib/agent/reason/schemas';

describe('Reserve Policy Rules', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        ethBalance: 0.2,
        usdcBalance: 1000,
        chainId: 8453,
        emergencyMode: false,
        lastUpdated: new Date().toISOString(),
      })
    );
  });

  it('min-usdc-buffer passes when N/A for non-REPLENISH decision', async () => {
    const decision: Decision = {
      action: 'WAIT',
      confidence: 0.9,
      reasoning: 'No action.',
      parameters: null,
    };
    for (const rule of reservePolicyRules) {
      const result = await rule.validate(decision, {} as never);
      if (result.ruleName === 'min-usdc-buffer') {
        expect(result.passed).toBe(true);
        expect(result.message).toBe('N/A');
        break;
      }
    }
  });

  it('max-replenish-amount fails when amount exceeds cap', async () => {
    const decision: Decision = {
      action: 'REPLENISH_RESERVES',
      confidence: 0.9,
      reasoning: 'Replenish reserves.',
      parameters: {
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountIn: String(10000 * 1e6),
        slippageTolerance: 0.01,
        reason: 'below_target',
      },
    };
    for (const rule of reservePolicyRules) {
      const result = await rule.validate(decision, {} as never);
      if (result.ruleName === 'max-replenish-amount') {
        expect(result.passed).toBe(false);
        break;
      }
    }
  });

  it('emergency-halt fails REPLENISH when emergencyMode true', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        ethBalance: 0.02,
        usdcBalance: 100,
        chainId: 8453,
        emergencyMode: true,
        lastUpdated: new Date().toISOString(),
      })
    );
    const decision: Decision = {
      action: 'REPLENISH_RESERVES',
      confidence: 0.9,
      reasoning: 'Replenish.',
      parameters: {
        tokenIn: 'USDC',
        tokenOut: 'ETH',
        amountIn: String(50 * 1e6),
        slippageTolerance: 0.01,
        reason: 'below_target',
      },
    };
    for (const rule of reservePolicyRules) {
      const result = await rule.validate(decision, {} as never);
      if (result.ruleName === 'emergency-halt') {
        expect(result.passed).toBe(false);
        break;
      }
    }
  });
});
