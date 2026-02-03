/**
 * Aegis Agent - Policy Engine
 * 
 * Validates decisions against safety rules before execution.
 * Acts as a guardrail between LLM reasoning and actual blockchain execution.
 */

import { logger } from '../../logger';
import { validateRules, type PolicyRule } from './rules';
import type { Decision } from '../reason/schemas';
import type { AgentConfig } from '../index';

export interface PolicyValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  appliedRules: string[];
}

/**
 * Validate a decision against all policy rules
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
