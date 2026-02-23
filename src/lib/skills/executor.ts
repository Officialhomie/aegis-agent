/**
 * Aegis Skills - Executor
 * Executes skills with context. Placeholder implementation returns structured result;
 * future: format skill content as prompt, call LLM, parse response.
 */

import { getSkill } from './registry';
import type { SkillContext, SkillExecutionResult } from './types';
import { logger } from '../logger';

/**
 * Execute a single skill with the given context.
 */
export async function executeSkill(
  skillName: string,
  context: SkillContext
): Promise<SkillExecutionResult> {
  const skill = getSkill(skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  logger.info('[Skills] Executing skill', { skillName, contextKeys: Object.keys(context) });

  // Placeholder: in a full implementation we would:
  // 1. Format skill content + context as a prompt
  // 2. Call LLM for reasoning
  // 3. Parse LLM response into SkillExecutionResult
  return {
    success: true,
    decision: 'APPROVE',
    reasoning: `Executed ${skillName} successfully`,
    confidence: 85,
    appliedSkills: [skillName],
  };
}

/**
 * Execute multiple skills in order. Stops on first REJECT.
 */
export async function executeSkillChain(
  skillNames: string[],
  context: SkillContext
): Promise<SkillExecutionResult> {
  const results: SkillExecutionResult[] = [];

  for (const skillName of skillNames) {
    const result = await executeSkill(skillName, context);
    results.push(result);

    if (result.decision === 'REJECT') {
      return result;
    }
  }

  const decision = results.some((r) => r.decision === 'ESCALATE') ? 'ESCALATE' : 'APPROVE';
  const confidence = results.length > 0 ? Math.min(...results.map((r) => r.confidence)) : 0;

  return {
    success: true,
    decision,
    reasoning: results.map((r) => r.reasoning).join('\n'),
    confidence,
    appliedSkills: results.flatMap((r) => r.appliedSkills),
  };
}
