/**
 * Tests for the skills executor (hybrid: guards + optional LLM).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  initializeSkillRegistry,
  executeSkill,
  executeSkillChain,
} from '../../../src/lib/skills';

describe('Skill Executor', () => {
  beforeAll(async () => {
    await initializeSkillRegistry();
  });

  it('should execute gas estimation skill', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      estimatedCostUSD: 5.0,
      currentGasPrice: BigInt(20000000000), // 20 gwei
    };

    const result = await executeSkill('aegis-gas-estimation', context);
    expect(result.success).toBe(true);
    expect(result.appliedSkills).toContain('aegis-gas-estimation');
    expect(result.reasoning).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('should execute skill chain', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      estimatedCostUSD: 10.0,
    };

    const skills = [
      'aegis-gas-estimation',
      'aegis-agent-reputation',
      'aegis-protocol-vetting',
    ];

    const result = await executeSkillChain(skills, context);
    expect(result.appliedSkills.length).toBe(3);
    expect(result.appliedSkills).toContain('aegis-gas-estimation');
    expect(result.appliedSkills).toContain('aegis-agent-reputation');
    expect(result.appliedSkills).toContain('aegis-protocol-vetting');
    expect(result.decision).toBeDefined();
  });

  it('should throw when skill not found', async () => {
    await expect(
      executeSkill('nonexistent-skill', { agentWallet: '0x00' })
    ).rejects.toThrow('Skill not found');
  });

  it('should REJECT from deterministic gas guard when gas price exceeds limit', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      estimatedCostUSD: 5,
      currentGasPrice: BigInt(201 * 1e9), // 201 gwei (default limit 200)
    };
    const result = await executeSkill('aegis-gas-estimation', context);
    expect(result.decision).toBe('REJECT');
    expect(result.success).toBe(false);
    expect(result.reasoning).toContain('Gas price');
  });

  it('should REJECT from deterministic guard when estimated cost exceeds limit', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      estimatedCostUSD: 101, // default limit 100
      currentGasPrice: BigInt(1e9),
    };
    const result = await executeSkill('aegis-gas-estimation', context);
    expect(result.decision).toBe('REJECT');
    expect(result.success).toBe(false);
    expect(result.reasoning).toContain('cost');
  });

  it('should stop chain on first REJECT and return that result', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      estimatedCostUSD: 150, // triggers gas-estimation cost guard
    };
    const result = await executeSkillChain(
      ['aegis-gas-estimation', 'aegis-agent-reputation', 'aegis-protocol-vetting'],
      context
    );
    expect(result.decision).toBe('REJECT');
    expect(result.appliedSkills).toContain('aegis-gas-estimation');
    expect(result.appliedSkills).toHaveLength(1);
  });

  it('should ESCALATE from agent-reputation guard when passport tier is FLAGGED', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'p',
      estimatedCostUSD: 5,
      passport: { tier: 'FLAGGED' },
    };
    const result = await executeSkill('aegis-agent-reputation', context);
    expect(result.decision).toBe('ESCALATE');
    expect(result.success).toBe(false);
    expect(result.reasoning).toContain('FLAGGED');
  });

  it('should aggregate chain to ESCALATE when one skill returns ESCALATE', async () => {
    const context = {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'p',
      estimatedCostUSD: 5,
      passport: { tier: 'FLAGGED' },
    };
    const result = await executeSkillChain(
      ['aegis-gas-estimation', 'aegis-agent-reputation', 'aegis-protocol-vetting'],
      context
    );
    expect(result.decision).toBe('ESCALATE');
    expect(result.appliedSkills).toContain('aegis-agent-reputation');
  });
});
