/**
 * Tests for the skills executor.
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
});
