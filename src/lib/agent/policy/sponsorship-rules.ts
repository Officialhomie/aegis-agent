/**
 * Aegis Agent - Sponsorship Policy Rules
 *
 * Safety rules for SPONSOR_TRANSACTION: user legitimacy, protocol budget,
 * agent reserves, daily cap per user, global rate limit, gas price.
 */

import { getStateStore } from '../state-store';
import { getOnchainTxCount, getProtocolBudget, getAgentWalletBalance } from '../observe/sponsorship';
import { detectAbuse } from '../security/abuse-detection';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { AgentConfig } from '../index';
import type { PolicyRule, RuleResult } from './rules';

const RESERVE_THRESHOLD_ETH = Number(process.env.RESERVE_THRESHOLD_ETH) || 0.1;
const MAX_SPONSORSHIPS_PER_USER_DAY = Number(process.env.MAX_SPONSORSHIPS_PER_USER_DAY) || 3;
const MAX_SPONSORSHIPS_PER_MINUTE = Number(process.env.MAX_SPONSORSHIPS_PER_MINUTE) || 10;
const GAS_PRICE_MAX_GWEI = Number(process.env.GAS_PRICE_MAX_GWEI) || 2;
const MIN_HISTORICAL_TXS = 5;

function isSponsorshipDecision(decision: Decision): decision is Decision & { action: 'SPONSOR_TRANSACTION'; parameters: SponsorParams } {
  return decision.action === 'SPONSOR_TRANSACTION' && decision.parameters != null;
}

/**
 * Sponsorship-specific policy rules (applied when action is SPONSOR_TRANSACTION).
 */
export const sponsorshipPolicyRules: PolicyRule[] = [
  {
    name: 'user-legitimacy-check',
    description: 'User must have >= 5 historical txs and not be on spam list',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'user-legitimacy-check', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const userAddress = decision.parameters.userAddress as `0x${string}`;
      const [txCount, abuse] = await Promise.all([
        getOnchainTxCount(userAddress),
        detectAbuse(decision.parameters.userAddress),
      ]);
      if (abuse.isAbusive) {
        return {
          ruleName: 'user-legitimacy-check',
          passed: false,
          message: abuse.reason ?? 'Abuse detected',
          severity: 'ERROR',
        };
      }
      const passed = txCount >= MIN_HISTORICAL_TXS;
      return {
        ruleName: 'user-legitimacy-check',
        passed,
        message: passed
          ? `User has ${txCount} historical txs (min ${MIN_HISTORICAL_TXS})`
          : `User has ${txCount} historical txs (min ${MIN_HISTORICAL_TXS} required)`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'protocol-budget-check',
    description: 'Protocol must have sufficient x402 balance for estimated cost',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'protocol-budget-check', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const budget = await getProtocolBudget(decision.parameters.protocolId);
      const estimatedUSD = decision.parameters.estimatedCostUSD ?? 0;
      const passed = budget != null && budget.balanceUSD >= estimatedUSD;
      return {
        ruleName: 'protocol-budget-check',
        passed,
        message: passed
          ? `Protocol budget sufficient ($${budget?.balanceUSD ?? 0} >= $${estimatedUSD})`
          : `Protocol budget insufficient ($${budget?.balanceUSD ?? 0} < $${estimatedUSD})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'agent-reserve-check',
    description: 'Agent must maintain minimum ETH reserve (0.1 ETH)',
    severity: 'ERROR',
    validate: async (): Promise<RuleResult> => {
      const reserves = await getAgentWalletBalance();
      const passed = reserves.ETH >= RESERVE_THRESHOLD_ETH;
      return {
        ruleName: 'agent-reserve-check',
        passed,
        message: passed
          ? `Reserves OK (${reserves.ETH.toFixed(4)} ETH >= ${RESERVE_THRESHOLD_ETH})`
          : `Reserves low (${reserves.ETH.toFixed(4)} ETH < ${RESERVE_THRESHOLD_ETH})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'daily-cap-per-user',
    description: 'Max 3 sponsorships per user per day',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'daily-cap-per-user', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const user = decision.parameters.userAddress.toLowerCase();
      const store = await getStateStore();
      const dayKey = `aegis:sponsorship:user:${user}:day`;
      const raw = await store.get(dayKey);
      const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const trimmed = list.filter((t) => now - t < oneDayMs);
      const passed = trimmed.length < MAX_SPONSORSHIPS_PER_USER_DAY;
      if (passed) {
        trimmed.push(now);
        await store.set(dayKey, JSON.stringify(trimmed), { px: oneDayMs });
      }
      return {
        ruleName: 'daily-cap-per-user',
        passed,
        message: passed
          ? `User daily count OK (${trimmed.length}/${MAX_SPONSORSHIPS_PER_USER_DAY})`
          : `User daily limit exceeded (${trimmed.length}/${MAX_SPONSORSHIPS_PER_USER_DAY})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'global-rate-limit',
    description: 'Max 10 sponsorships per minute globally',
    severity: 'ERROR',
    validate: async (): Promise<RuleResult> => {
      const store = await getStateStore();
      const key = 'aegis:sponsorship:global:minute';
      const raw = await store.get(key);
      const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
      const now = Date.now();
      const oneMinuteMs = 60 * 1000;
      const trimmed = list.filter((t) => now - t < oneMinuteMs);
      const passed = trimmed.length < MAX_SPONSORSHIPS_PER_MINUTE;
      if (passed) {
        trimmed.push(now);
        await store.set(key, JSON.stringify(trimmed), { px: oneMinuteMs });
      }
      return {
        ruleName: 'global-rate-limit',
        passed,
        message: passed
          ? `Global rate OK (${trimmed.length}/${MAX_SPONSORSHIPS_PER_MINUTE})`
          : `Global rate limit exceeded (${trimmed.length}/${MAX_SPONSORSHIPS_PER_MINUTE})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'gas-price-optimization',
    description: 'Only sponsor when Base gas price < 2 Gwei',
    severity: 'ERROR',
    validate: async (decision, config): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'gas-price-optimization', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const currentGwei = config.currentGasPriceGwei ?? 0;
      const maxGwei = config.gasPriceMaxGwei ?? GAS_PRICE_MAX_GWEI;
      const passed = currentGwei < maxGwei;
      return {
        ruleName: 'gas-price-optimization',
        passed,
        message: passed
          ? `Gas price OK (${currentGwei} < ${maxGwei} Gwei)`
          : `Gas price too high (${currentGwei} >= ${maxGwei} Gwei)`,
        severity: 'ERROR',
      };
    },
  },
];

export interface PolicyValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  appliedRules: string[];
}

/**
 * Validate a SPONSOR_TRANSACTION decision against sponsorship rules only.
 */
export async function validateSponsorshipPolicy(
  decision: Decision,
  config: AgentConfig
): Promise<PolicyValidationResult> {
  const result: PolicyValidationResult = {
    passed: true,
    errors: [],
    warnings: [],
    appliedRules: [],
  };

  for (const rule of sponsorshipPolicyRules) {
    const ruleResult = await rule.validate(decision, config);
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

  return result;
}
