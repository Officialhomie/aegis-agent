/**
 * Delegation Policy Rules Tests
 *
 * Tests for the 6 delegation-specific policy rules.
 * Note: DELEGATION_ENABLED is read at module load time, so we test
 * the enabled state (default in test environment).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before imports
process.env.DELEGATION_ENABLED = 'true';

// Mock dependencies before importing
vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn(),
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/lib/delegation', () => ({
  validateDelegationForTransaction: vi.fn(),
  hasValidDelegation: vi.fn(),
  DelegationPermissionsSchema: {
    parse: vi.fn((p) => p),
  },
  isWithinScope: vi.fn().mockReturnValue(true),
  isWithinValueLimit: vi.fn().mockReturnValue(true),
  isDelegationTimeValid: vi.fn().mockReturnValue(true),
}));

import { getPrisma } from '../../../src/lib/db';
import { delegationPolicyRules } from '../../../src/lib/agent/policy/delegation-rules';
import type { Decision } from '../../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../../src/lib/agent';

const mockPrisma = {
  delegation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  delegationUsage: {
    count: vi.fn(),
  },
};

const baseConfig: AgentConfig = {
  confidenceThreshold: 0.75,
  maxTransactionValueUsd: 10_000,
  executionMode: 'SIMULATION',
  rateLimitWindowMs: 60_000,
  maxActionsPerWindow: 10,
};

const baseSponsorParams = {
  agentWallet: '0x1234567890123456789012345678901234567890',
  protocolId: 'test-protocol',
  maxGasLimit: 200000,
  estimatedCostUSD: 0.5,
  delegationId: 'test-delegation-id',
  targetContract: '0x2222222222222222222222222222222222222222',
};

const baseDecision: Decision = {
  action: 'SPONSOR_TRANSACTION',
  confidence: 0.9,
  reasoning: 'Sponsor transaction with delegation.',
  parameters: baseSponsorParams,
};

beforeEach(() => {
  vi.clearAllMocks();
  (getPrisma as ReturnType<typeof vi.fn>).mockReturnValue(mockPrisma);
});

describe('delegation-exists-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-exists-check')!;

  it('passes when delegation exists and is active', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      agent: baseSponsorParams.agentWallet.toLowerCase(),
      status: 'ACTIVE',
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.ruleName).toBe('delegation-exists-check');
  });

  it('fails when delegation not found', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue(null);

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('fails when agent address mismatch', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      agent: '0x9999999999999999999999999999999999999999', // Different agent
      status: 'ACTIVE',
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('mismatch');
  });

  it('fails when delegation is revoked', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      agent: baseSponsorParams.agentWallet.toLowerCase(),
      status: 'REVOKED',
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('REVOKED');
  });

  it('passes when delegation feature disabled', async () => {
    process.env.DELEGATION_ENABLED = 'false';

    // Re-import to get updated env
    vi.resetModules();
    const { delegationPolicyRules: freshRules } = await import(
      '../../../src/lib/agent/policy/delegation-rules'
    );
    const freshRule = freshRules.find((r) => r.name === 'delegation-exists-check')!;

    const result = await freshRule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('disabled');
  });

  it('passes for non-delegated decisions', async () => {
    const nonDelegatedDecision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Sponsor without delegation.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
        // No delegationId
      },
    };

    const result = await rule.validate(nonDelegatedDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('N/A');
  });
});

describe('delegation-scope-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-scope-check')!;

  it('passes when target contract is in scope', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        contracts: [baseSponsorParams.targetContract],
        functions: [],
      },
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
  });

  it('fails when target contract not in scope', async () => {
    // Override the mock for this test
    const { isWithinScope } = await import('../../../src/lib/delegation');
    (isWithinScope as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        contracts: ['0x1111111111111111111111111111111111111111'],
        functions: [],
      },
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('NOT in delegation scope');
  });

  it('passes when no target contract specified', async () => {
    const decisionWithoutTarget: Decision = {
      ...baseDecision,
      parameters: {
        ...baseSponsorParams,
        targetContract: undefined,
      },
    };

    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        contracts: [],
        functions: [],
      },
    });

    const result = await rule.validate(decisionWithoutTarget, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('check at execution');
  });
});

describe('delegation-expiry-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-expiry-check')!;

  it('passes for non-expired delegation', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 3600000),
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('valid until');
  });

  it('fails for expired delegation', async () => {
    const { isDelegationTimeValid } = await import('../../../src/lib/delegation');
    (isDelegationTimeValid as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      validFrom: new Date(Date.now() - 7200000),
      validUntil: new Date(Date.now() - 3600000), // Expired
    });
    mockPrisma.delegation.update.mockResolvedValue({});

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('expired');
    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'EXPIRED' },
      })
    );
  });
});

describe('delegation-budget-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-budget-check')!;

  it('passes when budget is sufficient', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('1000000000000000000'), // 1 ETH
      gasBudgetSpent: BigInt('0'),
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('Budget OK');
  });

  it('fails when budget insufficient', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('100000000000000'), // 0.0001 ETH
      gasBudgetSpent: BigInt('99000000000000'), // Nearly spent
    });

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Insufficient');
  });

  it('marks delegation as exhausted when budget is 0', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('100000000000000'),
      gasBudgetSpent: BigInt('100000000000000'), // Fully spent
    });
    mockPrisma.delegation.update.mockResolvedValue({});

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'EXHAUSTED' },
      })
    );
  });
});

describe('delegation-rate-limit-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-rate-limit-check')!;

  it('passes when within rate limits', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        maxTxPerHour: 10,
        maxTxPerDay: 50,
      },
    });
    mockPrisma.delegationUsage.count.mockResolvedValue(5); // Below both limits

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('Rate limits OK');
  });

  it('fails when hourly limit exceeded', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        maxTxPerHour: 5,
        maxTxPerDay: 50,
      },
    });
    mockPrisma.delegationUsage.count.mockResolvedValue(5); // At hourly limit

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Hourly limit exceeded');
  });

  it('fails when daily limit exceeded', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue({
      id: 'test-delegation-id',
      permissions: {
        maxTxPerHour: 100,
        maxTxPerDay: 10,
      },
    });
    mockPrisma.delegationUsage.count
      .mockResolvedValueOnce(5) // Hourly count OK
      .mockResolvedValueOnce(10); // Daily count at limit

    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Daily limit exceeded');
  });
});

describe('delegation-value-check', () => {
  const rule = delegationPolicyRules.find((r) => r.name === 'delegation-value-check')!;

  it('passes for gas sponsorship (no ETH transfer)', async () => {
    const result = await rule.validate(baseDecision, baseConfig);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('no ETH value transfer');
  });
});

describe('All delegation rules integrated', () => {
  it('all 6 rules are defined', () => {
    expect(delegationPolicyRules).toHaveLength(6);

    const ruleNames = delegationPolicyRules.map((r) => r.name);
    expect(ruleNames).toContain('delegation-exists-check');
    expect(ruleNames).toContain('delegation-scope-check');
    expect(ruleNames).toContain('delegation-value-check');
    expect(ruleNames).toContain('delegation-expiry-check');
    expect(ruleNames).toContain('delegation-budget-check');
    expect(ruleNames).toContain('delegation-rate-limit-check');
  });

  it('all rules have ERROR severity', () => {
    for (const rule of delegationPolicyRules) {
      expect(rule.severity).toBe('ERROR');
    }
  });
});
