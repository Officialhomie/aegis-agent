/**
 * Tier rules unit tests (tierValidationRule, tierBudgetMultiplierRule)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tierValidationRule, tierBudgetMultiplierRule } from '../../../src/lib/agent/policy/tier-rules';
import type { Decision } from '../../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../../src/lib/agent';

const mockValidateAccount = vi.hoisted(() => vi.fn());
const mockProtocolFindUnique = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/validation/account-validator', () => ({
  validateAccount: (...args: unknown[]) => mockValidateAccount(...args),
}));

vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    protocolSponsor: { findUnique: mockProtocolFindUnique },
  }),
}));

describe('tierValidationRule', () => {
  const baseDecision: Decision = {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Valid sponsorship for tier rules test.',
    parameters: {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      maxGasLimit: 200000,
      estimatedCostUSD: 0.5,
    },
  };

  const config: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'SIMULATION',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAccount.mockResolvedValue({
      agentTier: 2,
      agentType: 'ERC4337_ACCOUNT',
      isValid: true,
      accountType: 'smart_account',
      reason: 'ERC-4337 compatible',
    });
    mockProtocolFindUnique.mockResolvedValue({
      requireERC8004: false,
      requireERC4337: false,
    });
  });

  it('passes for tier 2 (ERC-4337) when protocol has no tier requirements', async () => {
    const result = await tierValidationRule.validate(baseDecision, config);
    expect(result.passed).toBe(true);
    expect((baseDecision as any)._validatedTier).toBe(2);
    expect((baseDecision as any)._validatedAgentType).toBe('ERC4337_ACCOUNT');
  });

  it('fails for tier 0 (EOA)', async () => {
    mockValidateAccount.mockResolvedValue({
      agentTier: 0,
      agentType: 'EOA',
      isValid: false,
      accountType: 'eoa',
      reason: 'EOA',
    });
    const result = await tierValidationRule.validate(baseDecision, config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('EOA');
  });

  it('fails for tier 3 when protocol has requireERC4337: true', async () => {
    mockValidateAccount.mockResolvedValue({
      agentTier: 3,
      agentType: 'SMART_CONTRACT',
      isValid: true,
      accountType: 'smart_account',
      reason: 'Smart contract',
    });
    mockProtocolFindUnique.mockResolvedValue({
      requireERC8004: false,
      requireERC4337: true,
    });
    const result = await tierValidationRule.validate(baseDecision, config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('ERC-4337');
  });

  it('fails for tier 2 when protocol has requireERC8004: true', async () => {
    mockValidateAccount.mockResolvedValue({
      agentTier: 2,
      agentType: 'ERC4337_ACCOUNT',
      isValid: true,
      accountType: 'smart_account',
      reason: 'ERC-4337',
    });
    mockProtocolFindUnique.mockResolvedValue({
      requireERC8004: true,
      requireERC4337: false,
    });
    const result = await tierValidationRule.validate(baseDecision, config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('ERC-8004');
  });

  it('fails closed when validateAccount throws', async () => {
    mockValidateAccount.mockRejectedValue(new Error('RPC unavailable'));
    const result = await tierValidationRule.validate(baseDecision, config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('RPC');
  });
});

describe('tierBudgetMultiplierRule', () => {
  const config: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'SIMULATION',
  };

  it('attaches 3.0x for tier 1', async () => {
    const decision: Decision & { _validatedTier?: number } = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    (decision as any)._validatedTier = 1;
    const result = await tierBudgetMultiplierRule.validate(decision, config);
    expect(result.passed).toBe(true);
    expect((decision as any)._tierBudgetMultiplier).toBe(3.0);
  });

  it('attaches 1.0x for tier 2', async () => {
    const decision: Decision & { _validatedTier?: number } = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    (decision as any)._validatedTier = 2;
    const result = await tierBudgetMultiplierRule.validate(decision, config);
    expect(result.passed).toBe(true);
    expect((decision as any)._tierBudgetMultiplier).toBe(1.0);
  });

  it('attaches 0.5x for tier 3', async () => {
    const decision: Decision & { _validatedTier?: number } = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };
    (decision as any)._validatedTier = 3;
    const result = await tierBudgetMultiplierRule.validate(decision, config);
    expect(result.passed).toBe(true);
    expect((decision as any)._tierBudgetMultiplier).toBe(0.5);
  });
});
