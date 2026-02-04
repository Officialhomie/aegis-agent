/**
 * Policy rules validation tests
 */

import { describe, it, expect, vi } from 'vitest';
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
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    protocolSponsor: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  }),
}));

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ balanceUSD: 100 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 0, chainId: 8453 }),
}));

vi.mock('../../src/lib/agent/security/abuse-detection', () => ({
  detectAbuse: vi.fn().mockResolvedValue({ isAbusive: false }),
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

  const validSponsorParams = {
    agentWallet: '0x1234567890123456789012345678901234567890',
    protocolId: 'test-protocol',
    maxGasLimit: 200000,
    estimatedCostUSD: 0.5,
  };

  it('fails when confidence below threshold', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.5,
      reasoning: 'Sponsor user transaction for protocol.',
      parameters: validSponsorParams,
    };
    const results = await validateRules(decision, baseConfig);
    const confidenceRule = results.find((r) => r.ruleName === 'confidence-threshold');
    expect(confidenceRule?.passed).toBe(false);
  });

  it('fails when reasoning too short', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Short',
      parameters: validSponsorParams,
    };
    const results = await validateRules(decision, baseConfig);
    const reasoningRule = results.find((r) => r.ruleName === 'reasoning-required');
    expect(reasoningRule?.passed).toBe(false);
  });

  it('fails when parameters missing for SPONSOR_TRANSACTION', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid reasoning for sponsorship decision.',
      parameters: null,
    } as unknown as Decision;
    const results = await validateRules(decision, baseConfig);
    const paramsRule = results.find((r) => r.ruleName === 'parameters-required');
    expect(paramsRule?.passed).toBe(false);
  });

  it('passes when decision and config valid', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid reasoning for sponsorship with sufficient length.',
      parameters: validSponsorParams,
    };
    const results = await validateRules(decision, baseConfig);
    const failed = results.filter((r) => !r.passed);
    expect(failed.length).toBe(0);
  });

  it('fails readonly mode for execution action', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid reasoning for sponsorship with sufficient length.',
      parameters: validSponsorParams,
    };
    const results = await validateRules(decision, {
      ...baseConfig,
      executionMode: 'READONLY',
    });
    const readonlyRule = results.find((r) => r.ruleName === 'readonly-mode');
    expect(readonlyRule?.passed).toBe(false);
  });
});
