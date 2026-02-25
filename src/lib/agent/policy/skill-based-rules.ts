/**
 * Aegis Agent - Skill-based policy rules
 * Optional sponsorship validation using the Skills framework (gas, reputation, protocol vetting).
 * When SKILLS_ENFORCED=true, policy uses this result to pass/fail.
 */

import { executeSkillChain } from '../../skills/executor';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import { logger } from '../../logger';

const SPONSORSHIP_SKILLS = [
  'aegis-gas-estimation',
  'aegis-agent-reputation',
  'aegis-protocol-vetting',
] as const;

function isSponsorshipDecision(
  decision: Decision
): decision is Decision & { action: 'SPONSOR_TRANSACTION'; parameters: SponsorParams } {
  return decision.action === 'SPONSOR_TRANSACTION' && decision.parameters != null;
}

export interface ValidateWithSkillsOptions {
  /** Current gas price in Gwei (for gas-estimation skill context) */
  currentGasPriceGwei?: number;
  chainId?: number;
  /** Optional passport data for agent-reputation skill */
  passport?: { tier?: string };
}

export interface ValidateWithSkillsResult {
  approved: boolean;
  reasoning: string;
  appliedSkills: string[];
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  confidence: number;
  warnings: string[];
}

/**
 * Run skill-based validation for a SPONSOR_TRANSACTION decision.
 * Returns full result for auditability; when SKILLS_ENFORCED=true, policy uses approved to pass/fail.
 */
export async function validateWithSkills(
  decision: Decision,
  options: ValidateWithSkillsOptions = {}
): Promise<ValidateWithSkillsResult> {
  if (!isSponsorshipDecision(decision)) {
    return {
      approved: true,
      reasoning: 'Not a sponsorship decision; skills skip.',
      appliedSkills: [],
      decision: 'APPROVE',
      confidence: 100,
      warnings: [],
    };
  }

  const params = decision.parameters;
  const currentGasPriceGwei = options.currentGasPriceGwei ?? 0;
  // Convert Gwei to Wei: multiply by 1e9 first (keeping decimal precision), then floor and convert to BigInt
  const gasPriceWei = BigInt(Math.floor(currentGasPriceGwei * 1e9));

  const context = {
    agentWallet: params.agentWallet,
    protocolId: params.protocolId,
    estimatedCostUSD: params.estimatedCostUSD,
    currentGasPrice: gasPriceWei,
    chainId: options.chainId,
    passport: options.passport,
  };

  try {
    const result = await executeSkillChain([...SPONSORSHIP_SKILLS], context);

    logger.info('[Policy] Skill-based validation complete', {
      decision: result.decision,
      confidence: result.confidence,
      skills: result.appliedSkills,
    });

    return {
      approved: result.decision === 'APPROVE',
      reasoning: result.reasoning,
      appliedSkills: result.appliedSkills,
      decision: result.decision ?? 'APPROVE',
      confidence: result.confidence,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    logger.warn('[Policy] Skill-based validation failed', { error: err });
    return {
      approved: true,
      reasoning: 'Skill execution failed; falling back to allow (existing rules still apply).',
      appliedSkills: [],
      decision: 'APPROVE',
      confidence: 0,
      warnings: [err instanceof Error ? err.message : String(err)],
    };
  }
}
