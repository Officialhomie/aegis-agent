/**
 * Aegis Agent - Policy Rules
 * 
 * Defines the safety rules that all decisions must pass before execution.
 * Rules are checked in order and can be configured per-agent.
 */

import type { Decision } from '../reason/schemas';
import type { AgentConfig } from '../index';

export interface PolicyRule {
  name: string;
  description: string;
  severity: 'ERROR' | 'WARNING';
  validate: (decision: Decision, config: AgentConfig) => Promise<RuleResult>;
}

export interface RuleResult {
  ruleName: string;
  passed: boolean;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

/**
 * Built-in policy rules
 */
const builtInRules: PolicyRule[] = [
  // Rule: Confidence threshold
  {
    name: 'confidence-threshold',
    description: 'Ensures decision confidence meets minimum threshold',
    severity: 'ERROR',
    validate: async (decision, config) => ({
      ruleName: 'confidence-threshold',
      passed: decision.action === 'WAIT' || decision.confidence >= config.confidenceThreshold,
      message: decision.confidence < config.confidenceThreshold
        ? `Confidence ${decision.confidence} below threshold ${config.confidenceThreshold}`
        : 'Confidence threshold met',
      severity: 'ERROR',
    }),
  },

  // Rule: No execution in readonly mode
  {
    name: 'readonly-mode',
    description: 'Prevents execution when in readonly mode',
    severity: 'ERROR',
    validate: async (decision, config) => ({
      ruleName: 'readonly-mode',
      passed: config.executionMode !== 'READONLY' || decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN',
      message: config.executionMode === 'READONLY' && decision.action !== 'WAIT'
        ? 'Cannot execute actions in READONLY mode'
        : 'Execution mode check passed',
      severity: 'ERROR',
    }),
  },

  // Rule: Reasoning required
  {
    name: 'reasoning-required',
    description: 'Ensures all decisions have adequate reasoning',
    severity: 'ERROR',
    validate: async (decision) => ({
      ruleName: 'reasoning-required',
      passed: decision.reasoning && decision.reasoning.length >= 20,
      message: !decision.reasoning || decision.reasoning.length < 20
        ? 'Insufficient reasoning provided for decision'
        : 'Reasoning requirement met',
      severity: 'ERROR',
    }),
  },

  // Rule: Parameters required for execution
  {
    name: 'parameters-required',
    description: 'Ensures action parameters are provided when needed',
    severity: 'ERROR',
    validate: async (decision) => {
      const actionsRequiringParams = ['EXECUTE', 'SWAP', 'TRANSFER', 'REBALANCE'];
      const needsParams = actionsRequiringParams.includes(decision.action);
      const hasParams = decision.parameters !== null;

      return {
        ruleName: 'parameters-required',
        passed: !needsParams || hasParams,
        message: needsParams && !hasParams
          ? `Action ${decision.action} requires parameters`
          : 'Parameters check passed',
        severity: 'ERROR',
      };
    },
  },

  // Rule: Alert human for high-value decisions (warning)
  {
    name: 'high-value-alert',
    description: 'Warns about high-value transactions',
    severity: 'WARNING',
    validate: async (decision, config) => {
      // This is a placeholder - actual implementation would check transaction value
      const isHighValue = false; // TODO: Calculate from decision parameters

      return {
        ruleName: 'high-value-alert',
        passed: !isHighValue,
        message: isHighValue
          ? 'High-value transaction detected - consider ALERT_HUMAN'
          : 'Value check passed',
        severity: 'WARNING',
      };
    },
  },
];

/**
 * Validate a decision against all rules
 */
export async function validateRules(
  decision: Decision,
  config: AgentConfig
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];

  for (const rule of builtInRules) {
    const result = await rule.validate(decision, config);
    results.push(result);
  }

  return results;
}

/**
 * Add a custom policy rule
 */
export function addCustomRule(rule: PolicyRule): void {
  builtInRules.push(rule);
}
