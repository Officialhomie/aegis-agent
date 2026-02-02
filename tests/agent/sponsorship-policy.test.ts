/**
 * Sponsorship policy rules tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePolicy } from '../../src/lib/agent/policy';
import type { Decision } from '../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../src/lib/agent';

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ protocolId: 'test', balanceUSD: 100, totalSpent: 0 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 0, chainId: 84532 }),
}));

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

vi.mock('../../src/lib/agent/security/abuse-detection', () => ({
  detectAbuse: vi.fn().mockResolvedValue({ isAbusive: false }),
}));

describe('validatePolicy for SPONSOR_TRANSACTION', () => {
  const config: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'SIMULATION',
    currentGasPriceGwei: 1.5,
  };

  it('passes when all sponsorship rules satisfied', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid sponsorship with sufficient protocol budget and agent history.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    const result = await validatePolicy(decision, config);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when reasoning too short', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Short',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    const result = await validatePolicy(decision, config);
    expect(result.passed).toBe(false);
    const reasoningRule = result.errors?.find((e) => e.includes('reasoning'));
    expect(reasoningRule).toBeDefined();
  });

  it('fails when gas price exceeds limit', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid sponsorship with sufficient protocol budget and agent history.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    const highGasConfig: AgentConfig = { ...config, currentGasPriceGwei: 5 };
    const result = await validatePolicy(decision, highGasConfig);
    expect(result.passed).toBe(false);
    const gasRule = result.errors?.find((e) => e.toLowerCase().includes('gas'));
    expect(gasRule).toBeDefined();
  });
});
