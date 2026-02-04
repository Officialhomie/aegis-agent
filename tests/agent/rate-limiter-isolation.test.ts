/**
 * Rate limiter isolation: per-mode rate limit keys, independent tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockSetNX = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: mockSetNX,
  }),
}));

vi.mock('../../src/lib/agent/observe/oracles', () => ({
  getPrice: vi.fn().mockResolvedValue({ price: '2000' }),
}));

vi.mock('../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));

vi.mock('../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    protocolSponsor: { findUnique: vi.fn().mockResolvedValue(null) },
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

import { validateRules } from '../../src/lib/agent/policy/rules';
import type { Decision } from '../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../src/lib/agent';

describe('Rate Limiter Isolation', () => {
  const sponsorDecision: Decision = {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Valid reasoning for sponsorship with sufficient length for test.',
    parameters: {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      maxGasLimit: 200000,
      estimatedCostUSD: 0.5,
    },
  };

  beforeEach(() => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('uses mode in rate limit store key when config.mode is set', async () => {
    const config: AgentConfig = {
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10_000,
      executionMode: 'SIMULATION',
      maxActionsPerWindow: 10,
      rateLimitWindowMs: 60_000,
      mode: 'reserve-pipeline',
    };
    await validateRules(sponsorDecision, config);
    const setCalls = mockSet.mock.calls.filter((c) => String(c[0]).startsWith('aegis:rate_limit'));
    expect(setCalls.length).toBeGreaterThan(0);
    expect(setCalls.some((c) => c[0] === 'aegis:rate_limit:reserve-pipeline')).toBe(true);
  });

  it('uses default key when config.mode is not set', async () => {
    const config: AgentConfig = {
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10_000,
      executionMode: 'SIMULATION',
      maxActionsPerWindow: 10,
      rateLimitWindowMs: 60_000,
    };
    await validateRules(sponsorDecision, config);
    const setCalls = mockSet.mock.calls.filter((c) => String(c[0]).startsWith('aegis:rate_limit'));
    expect(setCalls.some((c) => c[0] === 'aegis:rate_limit:default')).toBe(true);
  });

  it('different modes use different keys', async () => {
    await validateRules(sponsorDecision, {
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10_000,
      executionMode: 'SIMULATION',
      maxActionsPerWindow: 10,
      rateLimitWindowMs: 60_000,
      mode: 'gas-sponsorship',
    });
    await validateRules(sponsorDecision, {
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10_000,
      executionMode: 'SIMULATION',
      maxActionsPerWindow: 10,
      rateLimitWindowMs: 60_000,
      mode: 'reserve-pipeline',
    });
    const rateLimitKeys = [...new Set(mockSet.mock.calls.map((c) => c[0]).filter((k) => String(k).startsWith('aegis:rate_limit')))];
    expect(rateLimitKeys).toContain('aegis:rate_limit:gas-sponsorship');
    expect(rateLimitKeys).toContain('aegis:rate_limit:reserve-pipeline');
  });
});
