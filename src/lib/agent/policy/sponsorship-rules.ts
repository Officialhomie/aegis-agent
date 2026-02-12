/**
 * Aegis Agent - Sponsorship Policy Rules
 *
 * Safety rules for SPONSOR_TRANSACTION: user legitimacy, protocol budget,
 * agent reserves, daily cap per user, global rate limit, gas price.
 */

import { getConfigNumber } from '../../config';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { getOnchainTxCount, getProtocolBudget, getAgentWalletBalance } from '../observe/sponsorship';
import { detectAbuse } from '../security/abuse-detection';
import { getPassport } from '../identity/gas-passport';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { AgentConfig } from '../index';
import type { PolicyRule, RuleResult } from './rules';

const RESERVE_THRESHOLD_ETH = getConfigNumber('RESERVE_THRESHOLD_ETH', 0.1, 0.01, 10);
const MAX_SPONSORSHIPS_PER_USER_DAY = getConfigNumber('MAX_SPONSORSHIPS_PER_USER_DAY', 3, 1, 100);
const MAX_SPONSORSHIPS_PER_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_MINUTE', 10, 1, 100);
const MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE', 5, 1, 50);
const MAX_SPONSORSHIP_COST_USD = getConfigNumber('MAX_SPONSORSHIP_COST_USD', 0.5, 0.01, 100);
const GAS_PRICE_MAX_GWEI = getConfigNumber('GAS_PRICE_MAX_GWEI', 2, 0.1, 1000);
const MIN_HISTORICAL_TXS = 5;
const REQUIRE_AGENT_APPROVAL = process.env.REQUIRE_AGENT_APPROVAL === 'true';
/** Gas Passport preferential: min sponsorships to relax historical-tx requirement */
const PASSPORT_PREFERENTIAL_MIN_SPONSORSHIPS = getConfigNumber('GAS_PASSPORT_PREFERENTIAL_MIN_SPONSORSHIPS', 10, 1, 1000);
/** Gas Passport preferential: min success rate (basis points, 9500 = 95%) */
const PASSPORT_PREFERENTIAL_MIN_SUCCESS_BPS = getConfigNumber('GAS_PASSPORT_PREFERENTIAL_MIN_SUCCESS_BPS', 9500, 0, 10000);

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
        return { ruleName: 'agent-legitimacy-check', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const agentWallet = decision.parameters.agentWallet as `0x${string}`;
      const [txCount, abuse, passport] = await Promise.all([
        getOnchainTxCount(agentWallet),
        detectAbuse(decision.parameters.agentWallet),
        getPassport(decision.parameters.agentWallet),
      ]);
      if (abuse.isAbusive) {
        return {
          ruleName: 'agent-legitimacy-check',
          passed: false,
          message: abuse.reason ?? 'Abuse detected',
          severity: 'ERROR',
        };
      }
      const passportQualifies =
        passport.sponsorCount >= PASSPORT_PREFERENTIAL_MIN_SPONSORSHIPS &&
        passport.successRateBps >= PASSPORT_PREFERENTIAL_MIN_SUCCESS_BPS;
      const passed =
        passportQualifies || txCount >= MIN_HISTORICAL_TXS;
      const message = passed
        ? passportQualifies && txCount < MIN_HISTORICAL_TXS
          ? `Gas Passport qualifies (preferential): ${passport.sponsorCount} sponsorships, ${passport.successRateBps / 100}% success`
          : `Agent has ${txCount} historical txs (min ${MIN_HISTORICAL_TXS})`
        : `Agent has ${txCount} historical txs (min ${MIN_HISTORICAL_TXS} required)`;
      return {
        ruleName: 'agent-legitimacy-check',
        passed,
        message,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'approved-agent-check',
    description: 'Agent must be approved by protocol for sponsorship',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'approved-agent-check', passed: true, message: 'N/A', severity: 'ERROR' };
      }

      // Skip check if agent approval not required
      if (!REQUIRE_AGENT_APPROVAL) {
        return {
          ruleName: 'approved-agent-check',
          passed: true,
          message: 'Agent approval not required (REQUIRE_AGENT_APPROVAL=false)',
          severity: 'ERROR',
        };
      }

      const agentAddress = decision.parameters.agentWallet.toLowerCase();
      const protocolId = decision.parameters.protocolId;

      try {
        const { getPrisma } = await import('../../db');
        const db = getPrisma();

        // Check if agent is approved for this protocol
        const approval = await db.approvedAgent.findUnique({
          where: {
            protocolId_agentAddress: {
              protocolId,
              agentAddress,
            },
          },
        });

        if (!approval) {
          return {
            ruleName: 'approved-agent-check',
            passed: false,
            message: `Agent ${agentAddress.slice(0, 10)}... not approved for protocol ${protocolId}`,
            severity: 'ERROR',
          };
        }

        if (!approval.isActive) {
          return {
            ruleName: 'approved-agent-check',
            passed: false,
            message: `Agent ${agentAddress.slice(0, 10)}... approval revoked for protocol ${protocolId}`,
            severity: 'ERROR',
          };
        }

        // Check daily budget limit for this agent
        const estimatedCost = decision.parameters.estimatedCostUSD ?? 0;
        const store = await getStateStore();
        const dailyKey = `aegis:agent:${agentAddress}:${protocolId}:daily_spend`;
        const rawSpend = await store.get(dailyKey);
        const currentSpend = rawSpend ? parseFloat(rawSpend) : 0;

        if (currentSpend + estimatedCost > approval.maxDailyBudget) {
          return {
            ruleName: 'approved-agent-check',
            passed: false,
            message: `Agent daily budget exceeded ($${(currentSpend + estimatedCost).toFixed(2)} > $${approval.maxDailyBudget} limit)`,
            severity: 'ERROR',
          };
        }

        return {
          ruleName: 'approved-agent-check',
          passed: true,
          message: `Agent ${agentAddress.slice(0, 10)}... approved (budget: $${(approval.maxDailyBudget - currentSpend).toFixed(2)} remaining)`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Cannot verify agent approval - database unavailable', {
          error,
          protocolId,
          agentAddress,
          severity: 'CRITICAL',
          securityImpact: 'FAIL CLOSED - rejecting transaction',
        });
        return {
          ruleName: 'approved-agent-check',
          passed: false,
          message: 'Cannot verify agent approval - database unavailable (failing CLOSED for security)',
          severity: 'ERROR',
        };
      }
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
        return { ruleName: 'daily-cap-per-agent', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const agent = decision.parameters.agentWallet.toLowerCase();
      const store = await getStateStore();
      const dayKey = `aegis:sponsorship:agent:${agent}:day`;
      const raw = await store.get(dayKey);
      let list: number[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          list = Array.isArray(parsed) ? (parsed as number[]) : [];
          if (list.some((x) => typeof x !== 'number')) list = [];
        } catch (error) {
          logger.warn('[Sponsorship] Invalid sponsorship list format in cache', { error, key: dayKey });
        }
      }
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const trimmed = list.filter((t) => now - t < oneDayMs);
      const passed = trimmed.length < MAX_SPONSORSHIPS_PER_USER_DAY;
      if (passed) {
        trimmed.push(now);
        await store.set(dayKey, JSON.stringify(trimmed), { px: oneDayMs });
      }
      return {
        ruleName: 'daily-cap-per-agent',
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
      let list: number[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          list = Array.isArray(parsed) ? (parsed as number[]) : [];
          if (list.some((x) => typeof x !== 'number')) list = [];
        } catch (error) {
          logger.warn('[Sponsorship] Invalid sponsorship list format in cache', { error, key });
        }
      }
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
    name: 'per-protocol-rate-limit',
    description: 'Max sponsorships per minute per protocol',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'per-protocol-rate-limit', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const store = await getStateStore();
      const key = `aegis:sponsorship:protocol:${decision.parameters.protocolId}:minute`;
      const raw = await store.get(key);
      let list: number[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          list = Array.isArray(parsed) ? (parsed as number[]) : [];
          if (list.some((x) => typeof x !== 'number')) list = [];
        } catch (error) {
          logger.warn('[Sponsorship] Invalid sponsorship list format in cache', { error, key });
        }
      }
      const now = Date.now();
      const oneMinuteMs = 60 * 1000;
      const trimmed = list.filter((t) => now - t < oneMinuteMs);
      const passed = trimmed.length < MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE;
      if (passed) {
        trimmed.push(now);
        await store.set(key, JSON.stringify(trimmed), { px: oneMinuteMs });
      }
      return {
        ruleName: 'per-protocol-rate-limit',
        passed,
        message: passed
          ? `Protocol rate OK (${trimmed.length}/${MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE})`
          : `Protocol rate limit exceeded (${trimmed.length}/${MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'per-sponsorship-cost-cap',
    description: 'Max cost per sponsorship (default $0.50)',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'per-sponsorship-cost-cap', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const cost = decision.parameters.estimatedCostUSD ?? 0;
      const passed = cost <= MAX_SPONSORSHIP_COST_USD;
      return {
        ruleName: 'per-sponsorship-cost-cap',
        passed,
        message: passed
          ? `Cost OK ($${cost} <= $${MAX_SPONSORSHIP_COST_USD})`
          : `Cost exceeds cap ($${cost} > $${MAX_SPONSORSHIP_COST_USD})`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'contract-whitelist-check',
    description: 'Target contract must be in protocol whitelist (when target provided)',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isSponsorshipDecision(decision)) {
        return { ruleName: 'contract-whitelist-check', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      try {
        const { getPrisma } = await import('../../db');
        const db = getPrisma();
        const protocol = await db.protocolSponsor.findUnique({
          where: { protocolId: decision.parameters.protocolId },
        });
        if (!protocol || !protocol.whitelistedContracts?.length) {
          return { ruleName: 'contract-whitelist-check', passed: true, message: 'No whitelist configured', severity: 'ERROR' };
        }
        const targetContract = decision.parameters.targetContract;
        if (!targetContract) {
          return { ruleName: 'contract-whitelist-check', passed: true, message: 'No target contract in decision', severity: 'ERROR' };
        }
        const normalized = targetContract.toLowerCase();
        const allowed = protocol.whitelistedContracts.some((c) => c.toLowerCase() === normalized);
        return {
          ruleName: 'contract-whitelist-check',
          passed: allowed,
          message: allowed
            ? `Target ${normalized.slice(0, 10)}... in whitelist`
            : `Target ${normalized.slice(0, 10)}... not in protocol whitelist`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Cannot verify whitelist - database unavailable', {
          error,
          protocolId: decision.parameters.protocolId,
          targetContract: decision.parameters.targetContract,
          severity: 'CRITICAL',
          securityImpact: 'FAIL CLOSED - rejecting transaction',
        });
        return {
          ruleName: 'contract-whitelist-check',
          passed: false,
          message: 'Cannot verify whitelist - database unavailable (failing CLOSED for security)',
          severity: 'ERROR',
        };
      }
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
