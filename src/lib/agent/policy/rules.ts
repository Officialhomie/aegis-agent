/**
 * Aegis Agent - Policy Rules
 *
 * Defines the safety rules that all decisions must pass before execution.
 * Rules are checked in order and can be configured per-agent.
 */

import { getPrice } from '../observe/oracles';
import { getDefaultChainName } from '../observe/chains';
import { getStateStore } from '../state-store';
import type { Decision } from '../reason/schemas';
import type { ExecuteParams, SwapParams, TransferParams } from '../reason/schemas';
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

/** Fallback ETH price when oracle unavailable */
const FALLBACK_ETH_USD = 2000;

/**
 * Extract estimated USD value from decision parameters for value-limit rules.
 * Uses real-time oracle price for EXECUTE when available.
 */
async function extractTransactionValueUsd(decision: Decision): Promise<number> {
  const params = decision.parameters;
  if (!params) return 0;
  if (decision.action === 'TRANSFER') {
    const p = params as TransferParams;
    const amount = parseFloat(p.amount);
    return isNaN(amount) ? 0 : amount;
  }
  if (decision.action === 'SWAP' || decision.action === 'REBALANCE') {
    const p = params as SwapParams;
    const amount = parseFloat(p.amountIn);
    return isNaN(amount) ? 0 : amount;
  }
  if (decision.action === 'EXECUTE') {
    const p = params as ExecuteParams;
    const wei = p.value ? BigInt(p.value) : BigInt(0);
    const eth = Number(wei) / 1e18;
    const priceResult = await getPrice('ETH/USD', getDefaultChainName());
    const ethUsd = priceResult ? parseFloat(priceResult.price) : FALLBACK_ETH_USD;
    return eth * ethUsd;
  }
  return 0;
}

const RATE_LIMIT_KEY = 'aegis:rate_limit:default';

async function recordActionAndCheckRateLimit(config: AgentConfig): Promise<{ allowed: boolean; message: string }> {
  const max = config.maxActionsPerWindow ?? 0;
  const windowMs = config.rateLimitWindowMs ?? 60_000;
  if (max <= 0) return { allowed: true, message: 'Rate limit not configured' };
  const now = Date.now();
  const store = await getStateStore();
  const raw = await store.get(RATE_LIMIT_KEY);
  const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  const trimmed = list.filter((t) => now - t < windowMs);
  if (trimmed.length >= max) {
    return {
      allowed: false,
      message: `Rate limit exceeded: ${trimmed.length} actions in last ${windowMs}ms (max ${max})`,
    };
  }
  trimmed.push(now);
  await store.set(RATE_LIMIT_KEY, JSON.stringify(trimmed));
  return { allowed: true, message: 'Rate limit check passed' };
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
      passed: Boolean(decision.reasoning) && decision.reasoning.length >= 20,
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

  // Rule: Transaction value limit (ERROR)
  {
    name: 'transaction-value-limit',
    description: 'Rejects transactions exceeding max value (USD estimate)',
    severity: 'ERROR',
    validate: async (decision, config) => {
      if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN') {
        return { ruleName: 'transaction-value-limit', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const value = await extractTransactionValueUsd(decision);
      const max = config.maxTransactionValueUsd ?? 0;
      const over = max > 0 && value > max;
      return {
        ruleName: 'transaction-value-limit',
        passed: !over,
        message: over ? `Transaction value ${value} exceeds limit ${max} USD` : 'Value within limit',
        severity: 'ERROR',
      };
    },
  },

  // Rule: High-value alert (WARNING)
  {
    name: 'high-value-alert',
    description: 'Warns about high-value transactions',
    severity: 'WARNING',
    validate: async (decision, config) => {
      if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN') {
        return { ruleName: 'high-value-alert', passed: true, message: 'N/A', severity: 'WARNING' };
      }
      const value = await extractTransactionValueUsd(decision);
      const max = config.maxTransactionValueUsd ?? 0;
      const isHighValue = max > 0 && value > max * 0.5;

      return {
        ruleName: 'high-value-alert',
        passed: true,
        message: isHighValue
          ? `High-value transaction (est. ${value} USD) - consider ALERT_HUMAN`
          : 'Value check passed',
        severity: 'WARNING',
      };
    },
  },

  // Rule: Gas price limit
  {
    name: 'gas-price-limit',
    description: 'Rejects execution when current gas price exceeds configured max',
    severity: 'ERROR',
    validate: async (decision, config) => {
      if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN') {
        return { ruleName: 'gas-price-limit', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const current = config.currentGasPriceGwei;
      const max = config.gasPriceMaxGwei;
      if (current == null || max == null) {
        return { ruleName: 'gas-price-limit', passed: true, message: 'Gas limit not configured', severity: 'ERROR' };
      }
      const over = current > max;
      return {
        ruleName: 'gas-price-limit',
        passed: !over,
        message: over ? `Gas price ${current} Gwei exceeds max ${max} Gwei` : 'Gas price OK',
        severity: 'ERROR',
      };
    },
  },

  // Rule: Rate limiter
  {
    name: 'rate-limiter',
    description: 'Max actions per time window',
    severity: 'ERROR',
    validate: async (decision, config) => {
      if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN') {
        return { ruleName: 'rate-limiter', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const { allowed, message } = await recordActionAndCheckRateLimit(config);
      return { ruleName: 'rate-limiter', passed: allowed, message, severity: 'ERROR' };
    },
  },

  // Rule: Address whitelist
  {
    name: 'address-whitelist',
    description: 'Only transact with approved addresses',
    severity: 'ERROR',
    validate: async (decision, config) => {
      const allowed = config.allowedAddresses;
      if (!allowed || allowed.length === 0) {
        return { ruleName: 'address-whitelist', passed: true, message: 'Whitelist not configured', severity: 'ERROR' };
      }
      const normalize = (a: string) => a.toLowerCase();
      const set = new Set(allowed.map(normalize));
      if (decision.action === 'TRANSFER' && decision.parameters) {
        const recipient = (decision.parameters as TransferParams).recipient?.toLowerCase();
        const ok = recipient && set.has(recipient);
        return {
          ruleName: 'address-whitelist',
          passed: !!ok,
          message: ok ? 'Recipient allowed' : `Recipient not in whitelist`,
          severity: 'ERROR',
        };
      }
      if (decision.action === 'EXECUTE' && decision.parameters) {
        const contract = (decision.parameters as ExecuteParams).contractAddress?.toLowerCase();
        const ok = contract && set.has(contract);
        return {
          ruleName: 'address-whitelist',
          passed: !!ok,
          message: ok ? 'Contract allowed' : 'Contract not in whitelist',
          severity: 'ERROR',
        };
      }
      return { ruleName: 'address-whitelist', passed: true, message: 'N/A', severity: 'ERROR' };
    },
  },

  // Rule: Slippage protection
  {
    name: 'slippage-protection',
    description: 'Enforce max slippage tolerance for swaps',
    severity: 'ERROR',
    validate: async (decision, config) => {
      if ((decision.action !== 'SWAP' && decision.action !== 'REBALANCE') || !decision.parameters) {
        return { ruleName: 'slippage-protection', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const maxSlippage = config.maxSlippageTolerance;
      if (maxSlippage == null) {
        return { ruleName: 'slippage-protection', passed: true, message: 'Max slippage not configured', severity: 'ERROR' };
      }
      const p = decision.parameters as SwapParams;
      const decisionSlippage = p.slippageTolerance ?? 0;
      const over = decisionSlippage > maxSlippage;
      return {
        ruleName: 'slippage-protection',
        passed: !over,
        message: over ? `Slippage ${decisionSlippage} exceeds max ${maxSlippage}` : 'Slippage OK',
        severity: 'ERROR',
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
