/**
 * Aegis Skills - Deterministic guards (hard reject/escalate from SKILL.md red flags).
 * Run before LLM evaluation; keep isolated and unit-testable.
 */

import type { SkillContext, SkillExecutionResult } from './types';

const GAS_PRICE_REJECT_GWEI = Number(process.env.SKILLS_GAS_REJECT_GWEI ?? '200');
const COST_REJECT_USD = Number(process.env.SKILLS_COST_REJECT_USD ?? '100');

/**
 * aegis-gas-estimation: reject on extreme gas or cost (red flags from SKILL.md).
 */
export function runGasEstimationGuard(
  skillName: string,
  context: SkillContext
): SkillExecutionResult | null {
  const gwei = context.currentGasPrice != null ? Number(context.currentGasPrice) / 1e9 : 0;
  const costUsd = context.estimatedCostUSD ?? 0;

  if (gwei > GAS_PRICE_REJECT_GWEI) {
    return {
      success: false,
      decision: 'REJECT',
      reasoning: `[${skillName}] Gas price ${gwei.toFixed(1)} gwei exceeds safe limit (${GAS_PRICE_REJECT_GWEI} gwei). Potential attack.`,
      confidence: 100,
      appliedSkills: [skillName],
      warnings: ['Gas price red flag'],
    };
  }

  if (costUsd > COST_REJECT_USD) {
    return {
      success: false,
      decision: 'REJECT',
      reasoning: `[${skillName}] Estimated cost $${costUsd} exceeds limit ($${COST_REJECT_USD}). Likely misconfigured.`,
      confidence: 100,
      appliedSkills: [skillName],
      warnings: ['Cost red flag'],
    };
  }

  return null;
}

/**
 * aegis-protocol-vetting: no protocol vetting data in context; pass through to LLM.
 * Optional: reject if protocolId is in blocklist (future).
 */
export function runProtocolVettingGuard(
  _skillName: string,
  _context: SkillContext
): SkillExecutionResult | null {
  return null;
}

/**
 * aegis-agent-reputation: escalate if passport indicates FLAGGED tier.
 */
export function runAgentReputationGuard(
  skillName: string,
  context: SkillContext
): SkillExecutionResult | null {
  const passport = context.passport as { tier?: string } | undefined;
  if (passport?.tier === 'FLAGGED') {
    return {
      success: false,
      decision: 'ESCALATE',
      reasoning: `[${skillName}] Agent passport tier FLAGGED; manual review required.`,
      confidence: 100,
      appliedSkills: [skillName],
      warnings: ['Agent flagged'],
    };
  }
  return null;
}

const GUARD_MAP: Record<string, (name: string, ctx: SkillContext) => SkillExecutionResult | null> = {
  'aegis-gas-estimation': runGasEstimationGuard,
  'aegis-protocol-vetting': runProtocolVettingGuard,
  'aegis-agent-reputation': runAgentReputationGuard,
};

export function runDeterministicGuard(
  skillName: string,
  context: SkillContext
): SkillExecutionResult | null {
  const fn = GUARD_MAP[skillName];
  if (!fn) return null;
  return fn(skillName, context);
}
