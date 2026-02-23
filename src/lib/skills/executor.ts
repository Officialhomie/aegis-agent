/**
 * Aegis Skills - Executor (hybrid: deterministic guards + LLM evaluation).
 * Guards run first; on pass, LLM evaluates skill content + context. Parse failures are fail-closed when enforced.
 */

import { getSkill } from './registry';
import { runDeterministicGuard } from './guards';
import { evaluateSkillWithLLM, isSkillsLlmAvailable } from './llm';
import type { SkillContext, SkillExecutionResult } from './types';
import { logger } from '../logger';
import { incrementCounter } from '../monitoring/metrics';

const SKILLS_ENFORCED = process.env.SKILLS_ENFORCED === 'true';
const SKILLS_FAIL_CLOSED = process.env.SKILLS_FAIL_CLOSED !== 'false'; // default true when using LLM

function toExecutionResult(
  skillName: string,
  parsed: { decision: 'APPROVE' | 'REJECT' | 'ESCALATE'; confidence: number; reasoning: string; warnings?: string[] }
): SkillExecutionResult {
  return {
    success: parsed.decision === 'APPROVE',
    decision: parsed.decision,
    reasoning: parsed.reasoning,
    confidence: parsed.confidence,
    appliedSkills: [skillName],
    warnings: parsed.warnings,
  };
}

/**
 * Execute a single skill with the given context (guards then optional LLM).
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

  const guardResult = runDeterministicGuard(skillName, context);
  if (guardResult) {
    logger.info('[Skills] Deterministic guard result', {
      skillName,
      decision: guardResult.decision,
    });
    return guardResult;
  }

  if (SKILLS_ENFORCED && isSkillsLlmAvailable()) {
    try {
      const parsed = await evaluateSkillWithLLM(skill, context);
      return toExecutionResult(skillName, parsed);
    } catch (err) {
      logger.warn('[Skills] LLM evaluation failed', { skillName, error: err });
      if (SKILLS_FAIL_CLOSED) {
        incrementCounter('aegis_skills_parse_fail_total', 1, { skill: skillName });
        return {
          success: false,
          decision: 'REJECT',
          reasoning: `[${skillName}] Skill evaluation failed (parse or LLM error); fail-closed.`,
          confidence: 0,
          appliedSkills: [skillName],
          warnings: [err instanceof Error ? err.message : String(err)],
        };
      }
    }
  }

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
    warnings: results.flatMap((r) => r.warnings ?? []),
  };
}
