/**
 * Aegis Agent - Policy Engine
 * 
 * Validates decisions against safety rules before execution.
 * Acts as a guardrail between LLM reasoning and actual blockchain execution.
 * When SKILLS_ENFORCED=true, skill verdict (reject/escalate) is enforced for SPONSOR_TRANSACTION.
 */

import { logger } from '../../logger';
import { incrementCounter } from '../../monitoring/metrics';
import { validateRules } from './rules';
import { validateWithSkills } from './skill-based-rules';
import type { Decision } from '../reason/schemas';
import type { AgentConfig } from '../index';

export interface PolicyValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  appliedRules: string[];
}

/**
 * Validate a decision against all policy rules and (when enforced) skill verdicts.
 */
export async function validatePolicy(
  decision: Decision,
  config: AgentConfig
): Promise<PolicyValidationResult> {
  const result: PolicyValidationResult = {
    passed: true,
    errors: [],
    warnings: [],
    appliedRules: [],
  };

  try {
    const ruleResults = await validateRules(decision, config);

    for (const ruleResult of ruleResults) {
      result.appliedRules.push(ruleResult.ruleName);

      if (!ruleResult.passed) {
        if (ruleResult.severity === 'ERROR') {
          result.passed = false;
          result.errors.push(`[${ruleResult.ruleName}] ${ruleResult.message}`);
        } else {
          result.warnings.push(`[${ruleResult.ruleName}] ${ruleResult.message}`);
        }
      }
    }

    if (process.env.SKILLS_ENFORCED === 'true' && decision.action === 'SPONSOR_TRANSACTION') {
      const skillResult = await validateWithSkills(decision, {
        currentGasPriceGwei: config.currentGasPriceGwei,
      });
      for (const s of skillResult.appliedSkills) {
        if (!result.appliedRules.includes(s)) result.appliedRules.push(s);
      }
      for (const w of skillResult.warnings) {
        result.warnings.push(`[Skills] ${w}`);
      }
      if (!skillResult.approved) {
        result.passed = false;
        result.errors.push(`[Skills] ${skillResult.decision}: ${skillResult.reasoning}`);
        incrementCounter('aegis_skills_enforced_reject_total', 1, {
          decision: skillResult.decision,
          protocol: decision.parameters?.protocolId ?? 'unknown',
        });
      }
    }

    logger.info('[Policy] Validation result', {
      passed: result.passed,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
    });

    return result;
  } catch (error) {
    logger.error('[Policy] Error during validation', { error });
    return {
      passed: false,
      errors: [`Policy validation error: ${error}`],
      warnings: [],
      appliedRules: [],
    };
  }
}

export { validateRules, type PolicyRule } from './rules';
export { validateSponsorshipPolicy, sponsorshipPolicyRules } from './sponsorship-rules';
export { reservePolicyRules } from './reserve-rules';
export {
  validateWithSkills,
  type ValidateWithSkillsOptions,
  type ValidateWithSkillsResult,
} from './skill-based-rules';