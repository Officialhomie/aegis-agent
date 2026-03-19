/**
 * Agent Tier Policy Rules
 *
 * Validates agent tier (ERC-8004 / ERC-4337 / smart contract / EOA) on every
 * SPONSOR_TRANSACTION decision and attaches the validated tier to the decision
 * object for downstream rules and execution.
 *
 * These rules must run FIRST in sponsorshipPolicyRules so that:
 * 1. EOAs are rejected before any budget or rate-limit checks.
 * 2. The validated tier is available to approved-agent-check and paymaster-signer.
 */

import { logger } from '../../logger';
import { validateAccount } from '../validation/account-validator';
import type { Decision } from '../reason/schemas';
import type { AgentConfig } from '../index';
import type { PolicyRule, RuleResult } from './rules';

function isSponsorshipDecision(d: Decision): boolean {
  return d.action === 'SPONSOR_TRANSACTION' && d.parameters != null;
}

function getChainName(): 'base' | 'baseSepolia' {
  return (process.env.AGENT_NETWORK_ID ?? 'base-sepolia') === 'base' ? 'base' : 'baseSepolia';
}

/**
 * Rule 1: agent-tier-validation
 *
 * Calls validateAccount() to determine the live agent tier.
 * Attaches `decision._validatedTier` (number) and `decision._validatedAgentType` (string).
 *
 * Returns ERROR for:
 * - Tier 0 (EOA) — always rejected.
 * - Tier 2/3 when the protocol requires ERC-8004 agents (`requireERC8004 = true`).
 * - Tier 3 when the protocol requires ERC-4337 accounts (`requireERC4337 = true`).
 */
export const tierValidationRule: PolicyRule = {
  name: 'agent-tier-validation',
  description: 'Validates agent tier live from chain; rejects EOAs and enforces protocol tier requirements',
  severity: 'ERROR',
  validate: async (decision: Decision, config: AgentConfig): Promise<RuleResult> => {
    if (!isSponsorshipDecision(decision)) {
      return { ruleName: 'agent-tier-validation', passed: true, message: 'N/A', severity: 'ERROR' };
    }

    const params = decision.parameters as { agentWallet: string; protocolId: string };
    const agentWallet = params.agentWallet as `0x${string}`;
    const protocolId = params.protocolId;
    const chainName = getChainName();

    let result;
    try {
      result = await validateAccount(agentWallet, chainName);
    } catch (error) {
      logger.error('[TierRules] validateAccount failed — failing CLOSED', {
        agentWallet,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ruleName: 'agent-tier-validation',
        passed: false,
        message: 'Cannot validate agent tier — RPC unavailable (failing CLOSED)',
        severity: 'ERROR',
      };
    }

    // Attach validated tier to decision for downstream use
    (decision as any)._validatedTier = result.agentTier;
    (decision as any)._validatedAgentType = result.agentType;

    // EOAs are never sponsored
    if (result.agentTier === 0) {
      logger.warn('[TierRules] EOA rejected', { agentWallet: agentWallet.slice(0, 12), protocolId });
      return {
        ruleName: 'agent-tier-validation',
        passed: false,
        message: `EOA (externally owned account) is not eligible for sponsorship`,
        severity: 'ERROR',
      };
    }

    // Protocol-level tier requirements: fetch from DB lazily
    try {
      const { getPrisma } = await import('../../db');
      const db = getPrisma();
      const protocol = await db.protocolSponsor.findUnique({
        where: { protocolId },
        select: { requireERC8004: true, requireERC4337: true },
      });

      if (protocol?.requireERC8004 && result.agentTier !== 1) {
        return {
          ruleName: 'agent-tier-validation',
          passed: false,
          message: `Protocol ${protocolId} requires ERC-8004 agents (tier 1); agent is tier ${result.agentTier} (${result.agentType})`,
          severity: 'ERROR',
        };
      }

      if (protocol?.requireERC4337 && result.agentTier > 2) {
        return {
          ruleName: 'agent-tier-validation',
          passed: false,
          message: `Protocol ${protocolId} requires ERC-4337 accounts (tier ≤ 2); agent is tier ${result.agentTier} (${result.agentType})`,
          severity: 'ERROR',
        };
      }
    } catch (error) {
      // Non-fatal: if DB unavailable, only block tier 0 — protocol tier requirements can't be checked
      logger.warn('[TierRules] Cannot read protocol tier requirements — continuing with tier check only', {
        protocolId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug('[TierRules] Agent tier validated', {
      agentWallet: agentWallet.slice(0, 12),
      agentTier: result.agentTier,
      agentType: result.agentType,
      protocolId,
    });

    return {
      ruleName: 'agent-tier-validation',
      passed: true,
      message: `Agent tier ${result.agentTier} (${result.agentType}) — eligible`,
      severity: 'ERROR',
    };
  },
};

/**
 * Rule 2: tier-budget-multiplier
 *
 * Reads `decision._validatedTier` and attaches a budget multiplier.
 * This is metadata only (SKIP severity) — downstream budget checks can use
 * `decision._tierBudgetMultiplier` to scale per-agent daily limits.
 *
 * Multipliers:
 *   Tier 1 (ERC-8004): 3.0x — preferred agents get higher budget headroom
 *   Tier 2 (ERC-4337): 1.0x — standard
 *   Tier 3 (other):    0.5x — fallback, conservative
 */
export const tierBudgetMultiplierRule: PolicyRule = {
  name: 'tier-budget-multiplier',
  description: 'Attaches tier-based budget multiplier to decision for downstream budget accounting',
  severity: 'WARNING',
  validate: async (decision: Decision): Promise<RuleResult> => {
    if (!isSponsorshipDecision(decision)) {
      return { ruleName: 'tier-budget-multiplier', passed: true, message: 'N/A', severity: 'WARNING' };
    }

    const tier = (decision as any)._validatedTier as number | undefined;
    let multiplier: number;

    switch (tier) {
      case 1:
        multiplier = 3.0;
        break;
      case 2:
        multiplier = 1.0;
        break;
      case 3:
        multiplier = 0.5;
        break;
      default:
        // Tier not yet validated (rule ran before agent-tier-validation) — use conservative default
        multiplier = 1.0;
        break;
    }

    (decision as any)._tierBudgetMultiplier = multiplier;

    return {
      ruleName: 'tier-budget-multiplier',
      passed: true,
      message: `Tier ${tier ?? 'unknown'} budget multiplier: ${multiplier}x`,
      severity: 'WARNING',
    };
  },
};
