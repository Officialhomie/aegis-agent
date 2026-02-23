/**
 * Aegis Agent - Skill-based policy rules
 * Optional sponsorship validation using the Skills framework (gas, reputation, protocol vetting).
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
}

/**
 * Run skill-based validation for a SPONSOR_TRANSACTION decision.
 * Returns approved/rejected and reasoning. Does not replace existing policy rules;
 * call this in addition to or as part of policy validation if skills are enabled.
 */
export async function validateWithSkills(
  decision: Decision,
  options: ValidateWithSkillsOptions = {}
): Promise<{
  approved: boolean;
  reasoning: string;
  appliedSkills: string[];
}> {
  if (!isSponsorshipDecision(decision)) {
    return {
      approved: true,
      reasoning: 'Not a sponsorship decision; skills skip.',
      appliedSkills: [],
    };
  }

  const params = decision.parameters;
  const currentGasPriceGwei = options.currentGasPriceGwei ?? 0;
  const gasPriceWei = BigInt(currentGasPriceGwei) * BigInt(1e9);

  const context = {
    agentWallet: params.agentWallet,
    protocolId: params.protocolId,
    estimatedCostUSD: params.estimatedCostUSD,
    currentGasPrice: gasPriceWei,
    chainId: options.chainId,
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
    };
  } catch (err) {
    logger.warn('[Policy] Skill-based validation failed', { error: err });
    return {
      approved: true,
      reasoning: 'Skill execution failed; falling back to allow (existing rules still apply).',
      appliedSkills: [],
    };
  }
}
