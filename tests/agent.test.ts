/**
 * Aegis Agent - Core Tests
 * 
 * Tests for the agent's decision-making and policy enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionSchema, type Decision } from '@/src/lib/agent/reason/schemas';
import { validatePolicy } from '@/src/lib/agent/policy';
import type { AgentConfig } from '@/src/lib/agent';

// Mock DB and sponsorship so policy rules (which call getProtocolBudget, findUnique) don't throw
vi.mock('@/src/lib/db', () => ({
  getPrisma: () => ({
    protocolSponsor: { findUnique: vi.fn().mockResolvedValue({ balanceUSD: 500 }) },
    approvedAgent: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock('@/src/lib/agent/observe/sponsorship', () => ({
  getProtocolBudget: vi.fn().mockResolvedValue({ balanceUSD: 500 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 1, USDC: 100, chainId: 8453 }),
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
}));
vi.mock('@/src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock config for testing
const testConfig: AgentConfig = {
  confidenceThreshold: 0.75,
  maxTransactionValueUsd: 10000,
  executionMode: 'SIMULATION',
};

describe('Decision Schema Validation', () => {
  it('should validate a valid WAIT decision', () => {
    const decision: Decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Market conditions are uncertain, waiting for better opportunity.',
      parameters: null,
    };

    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should validate a valid SPONSOR_TRANSACTION decision', () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.85,
      reasoning: 'Conditions are favorable for sponsoring this user.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.05,
      },
    };

    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should reject invalid confidence values', () => {
    const decision = {
      action: 'WAIT',
      confidence: 1.5, // Invalid - above 1.0
      reasoning: 'This should fail validation.',
      parameters: null,
    };

    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });

  it('should reject reasoning that is too short', () => {
    const decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Short', // Too short - less than 10 chars
      parameters: null,
    };

    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });
});

describe('Policy Validation', () => {
  it('should pass a valid WAIT decision', async () => {
    const decision: Decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Waiting for better market conditions before taking action.',
      parameters: null,
    };

    const result = await validatePolicy(decision, testConfig);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject execution with low confidence', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.5, // Below threshold of 0.75
      reasoning: 'Attempting to sponsor with low confidence.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.05,
      },
    };

    const result = await validatePolicy(decision, testConfig);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  it('should reject actions in readonly mode', async () => {
    const readonlyConfig: AgentConfig = {
      ...testConfig,
      executionMode: 'READONLY',
    };

    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Attempting to sponsor in readonly mode.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.05,
      },
    };

    const result = await validatePolicy(decision, readonlyConfig);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('READONLY'))).toBe(true);
  });

  it('should require parameters for execution actions', async () => {
    const decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Attempting to sponsor without parameters.',
      parameters: null,
    } as unknown as Decision;

    const result = await validatePolicy(decision, testConfig);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('parameters'))).toBe(true);
  });
});

describe('Action Types', () => {
  it('should accept all valid action types', () => {
    const decisions: Array<{ action: string; parameters: unknown }> = [
      { action: 'WAIT', parameters: null },
      { action: 'ALERT_HUMAN', parameters: { severity: 'HIGH', message: 'Test alert' } },
      { action: 'SPONSOR_TRANSACTION', parameters: { agentWallet: '0x1234567890123456789012345678901234567890', protocolId: 'p', maxGasLimit: 200000, estimatedCostUSD: 0.05 } },
      { action: 'SWAP_RESERVES', parameters: { tokenIn: 'USDC', tokenOut: 'ETH', amountIn: '100' } },
      { action: 'ALERT_PROTOCOL', parameters: { protocolId: 'p', budgetRemaining: 10 } },
      { action: 'REPLENISH_RESERVES', parameters: { tokenIn: 'USDC', tokenOut: 'ETH', amountIn: '100', reason: 'below_target' } },
      { action: 'ALERT_LOW_RUNWAY', parameters: { currentRunwayDays: 3, thresholdDays: 7, ethBalance: 0.1, dailyBurnRate: 0.01, severity: 'HIGH' as const, suggestedAction: 'Top up ETH reserves' } },
    ];

    for (const { action, parameters } of decisions) {
      const decision = {
        action,
        confidence: 0.8,
        reasoning: `Testing action type: ${action} for validity check.`,
        parameters,
      };

      const result = DecisionSchema.safeParse(decision);
      expect(result.success, `Action ${action} should parse: ${!result.success && 'error' in result ? JSON.stringify(result.error.flatten()) : ''}`).toBe(true);
    }
  });

  it('should reject invalid action types', () => {
    const decision = {
      action: 'INVALID_ACTION',
      confidence: 0.8,
      reasoning: 'This action type should not be valid.',
      parameters: null,
    };

    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });
});
