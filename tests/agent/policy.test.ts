/**
 * Policy rules validation tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateRules } from '../../src/lib/agent/policy/rules';
import type { Decision } from '../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../src/lib/agent';

vi.mock('../../src/lib/agent/observe/oracles', () => ({
  getPrice: vi.fn().mockResolvedValue({ price: '2000' }),
}));

vi.mock('../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('validateRules', () => {
  const baseConfig: AgentConfig = {
    confidenceThreshold: 0.75,
    maxTransactionValueUsd: 10_000,
    executionMode: 'SIMULATION',
    rateLimitWindowMs: 60_000,
    maxActionsPerWindow: 10,
  };

  it('passes WAIT decision', async () => {
    const decision: Decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Waiting for better conditions.',
      parameters: null,
    };
    const results = await validateRules(decision, baseConfig);
    const failed = results.filter((r) => !r.passed);
    expect(failed).toHaveLength(0);
  });

  it('fails when confidence below threshold', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.5,
      reasoning: 'Transfer funds.',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '100',
      },
    };
    const results = await validateRules(decision, baseConfig);
    const confidenceRule = results.find((r) => r.ruleName === 'confidence-threshold');
    expect(confidenceRule?.passed).toBe(false);
  });

  it('fails when reasoning too short', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Short',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '100',
      },
    };
    const results = await validateRules(decision, baseConfig);
    const reasoningRule = results.find((r) => r.ruleName === 'reasoning-required');
    expect(reasoningRule?.passed).toBe(false);
  });

  it('fails when parameters missing for TRANSFER', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Valid reasoning for transfer decision.',
      parameters: null,
    } as unknown as Decision;
    const results = await validateRules(decision, baseConfig);
    const paramsRule = results.find((r) => r.ruleName === 'parameters-required');
    expect(paramsRule?.passed).toBe(false);
  });

  it('passes when decision and config valid', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Valid reasoning for transfer with sufficient length.',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '100',
      },
    };
    const results = await validateRules(decision, baseConfig);
    const failed = results.filter((r) => !r.passed);
    expect(failed.length).toBe(0);
  });

  it('fails readonly mode for execution action', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Valid reasoning for transfer with sufficient length.',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '100',
      },
    };
    const results = await validateRules(decision, {
      ...baseConfig,
      executionMode: 'READONLY',
    });
    const readonlyRule = results.find((r) => r.ruleName === 'readonly-mode');
    expect(readonlyRule?.passed).toBe(false);
  });
});
