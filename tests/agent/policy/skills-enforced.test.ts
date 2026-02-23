/**
 * Policy integration tests: skills enforced (SKILLS_ENFORCED=true).
 * Uses mocked validateWithSkills to assert that policy passes/fails based on skill verdict.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatePolicy } from '../../../src/lib/agent/policy';
import type { Decision } from '../../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../../src/lib/agent';

vi.mock('../../../src/lib/agent/observe/oracles', () => ({
  getPrice: vi.fn().mockResolvedValue({ price: '2000' }),
}));
vi.mock('../../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));
vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    protocolSponsor: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ balanceUSD: 100 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 0, chainId: 8453 }),
}));
vi.mock('../../../src/lib/agent/security/abuse-detection', () => ({
  detectAbuse: vi.fn().mockResolvedValue({ isAbusive: false }),
}));
vi.mock('../../../src/lib/protocol/runtime-overrides', () => ({
  getActiveRuntimeOverride: vi.fn().mockResolvedValue(null),
  isWalletBlocked: vi.fn().mockResolvedValue(false),
}));

const mockValidateWithSkills = vi.fn();
vi.mock('../../../src/lib/agent/policy/skill-based-rules', () => ({
  validateWithSkills: (...args: unknown[]) => mockValidateWithSkills(...args),
}));

describe('validatePolicy with SKILLS_ENFORCED', () => {
  const baseConfig: AgentConfig = {
    confidenceThreshold: 0.75,
    maxTransactionValueUsd: 10_000,
    executionMode: 'SIMULATION',
    rateLimitWindowMs: 60_000,
    maxActionsPerWindow: 10,
  };

  const validSponsorDecision: Decision = {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Sponsor agent with sufficient reasoning length.',
    parameters: {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      maxGasLimit: 200000,
      estimatedCostUSD: 0.5,
    },
  };

  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.SKILLS_ENFORCED;
    mockValidateWithSkills.mockClear();
    mockValidateWithSkills.mockResolvedValue({
      approved: true,
      reasoning: 'OK',
      appliedSkills: [],
      decision: 'APPROVE' as const,
      confidence: 90,
      warnings: [],
    });
  });
  afterEach(() => {
    process.env.SKILLS_ENFORCED = savedEnv;
  });

  it('when SKILLS_ENFORCED=false, validateWithSkills is not called for sponsorship', async () => {
    process.env.SKILLS_ENFORCED = 'false';
    await validatePolicy(validSponsorDecision, baseConfig);
    expect(mockValidateWithSkills).not.toHaveBeenCalled();
  });

  it('when SKILLS_ENFORCED=true and skills reject, policy fails and records Skills error', async () => {
    process.env.SKILLS_ENFORCED = 'true';
    mockValidateWithSkills.mockResolvedValueOnce({
      approved: false,
      reasoning: 'Cost exceeds limit.',
      appliedSkills: ['aegis-gas-estimation'],
      decision: 'REJECT' as const,
      confidence: 100,
      warnings: ['Cost red flag'],
    });
    const result = await validatePolicy(validSponsorDecision, baseConfig);
    expect(mockValidateWithSkills).toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('Skills') || e.includes('REJECT'))).toBe(true);
    expect(result.appliedRules.some((r) => r.includes('aegis-'))).toBe(true);
  });

  it('when SKILLS_ENFORCED=true, WAIT decision does not call validateWithSkills', async () => {
    process.env.SKILLS_ENFORCED = 'true';
    const waitDecision: Decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Wait for better conditions.',
      parameters: null,
    };
    await validatePolicy(waitDecision, baseConfig);
    expect(mockValidateWithSkills).not.toHaveBeenCalled();
  });
});
