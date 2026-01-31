/**
 * Aegis Agent - Core Tests
 * 
 * Tests for the agent's decision-making and policy enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionSchema, type Decision } from '@/src/lib/agent/reason/schemas';
import { validatePolicy } from '@/src/lib/agent/policy';
import type { AgentConfig } from '@/src/lib/agent';

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

  it('should validate a valid EXECUTE decision', () => {
    const decision: Decision = {
      action: 'EXECUTE',
      confidence: 0.85,
      reasoning: 'Conditions are favorable for executing this transaction.',
      parameters: {
        contractAddress: '0x1234567890123456789012345678901234567890',
        functionName: 'transfer',
        args: ['0xrecipient', '1000000'],
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
      action: 'EXECUTE',
      confidence: 0.5, // Below threshold of 0.75
      reasoning: 'Attempting to execute with low confidence.',
      parameters: {
        contractAddress: '0x1234567890123456789012345678901234567890',
        functionName: 'test',
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
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Attempting to transfer in readonly mode.',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
      },
    };

    const result = await validatePolicy(decision, readonlyConfig);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('READONLY'))).toBe(true);
  });

  it('should require parameters for execution actions', async () => {
    const decision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Attempting to transfer without parameters.',
      parameters: null, // Invalid: TRANSFER requires params; testing policy rejection
    } as unknown as import('@/src/lib/agent/reason/schemas').Decision;

    const result = await validatePolicy(decision, testConfig);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('parameters'))).toBe(true);
  });
});

describe('Action Types', () => {
  it('should accept all valid action types', () => {
    const decisions: Array<{ action: string; parameters: unknown }> = [
      { action: 'EXECUTE', parameters: { contractAddress: '0x1234567890123456789012345678901234567890', functionName: 'transfer', args: [] } },
      { action: 'WAIT', parameters: null },
      { action: 'ALERT_HUMAN', parameters: { severity: 'HIGH', message: 'Test alert' } },
      { action: 'REBALANCE', parameters: { tokenIn: 'ETH', tokenOut: 'USDC', amountIn: '1000' } },
      { action: 'SWAP', parameters: { tokenIn: 'ETH', tokenOut: 'USDC', amountIn: '1000' } },
      { action: 'TRANSFER', parameters: { token: 'ETH', recipient: '0x1234567890123456789012345678901234567890', amount: '1000' } },
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
