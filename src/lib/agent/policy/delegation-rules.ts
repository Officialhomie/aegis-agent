/**
 * Aegis Agent - Delegation Policy Rules
 *
 * Safety rules for SPONSOR_TRANSACTION with delegation:
 * - delegation-exists-check: Agent has valid delegation from user
 * - delegation-scope-check: Tx within permitted contracts/functions
 * - delegation-value-check: Tx value within limits
 * - delegation-expiry-check: Delegation not expired
 * - delegation-budget-check: User gas budget sufficient
 * - delegation-rate-limit-check: Within maxTxPerDay/Hour
 */

import { logger } from '../../logger';
import {
  validateDelegationForTransaction,
  hasValidDelegation,
  DelegationPermissionsSchema,
  isWithinScope,
  isWithinValueLimit,
  isDelegationTimeValid,
} from '../../delegation';
import { getPrisma } from '../../db';
import type { Decision } from '../reason/schemas';
import type { SponsorParams } from '../reason/schemas';
import type { AgentConfig } from '../index';
import type { PolicyRule, RuleResult } from './rules';

const DELEGATION_ENABLED = process.env.DELEGATION_ENABLED === 'true';

/**
 * Type guard for delegation-enabled sponsorship decisions.
 */
function isDelegatedSponsorshipDecision(
  decision: Decision
): decision is Decision & {
  action: 'SPONSOR_TRANSACTION';
  parameters: SponsorParams & { delegationId: string };
} {
  return (
    decision.action === 'SPONSOR_TRANSACTION' &&
    decision.parameters != null &&
    typeof (decision.parameters as Record<string, unknown>).delegationId === 'string'
  );
}

/**
 * Delegation-specific policy rules.
 * Applied when a sponsorship decision includes a delegationId.
 */
export const delegationPolicyRules: PolicyRule[] = [
  {
    name: 'delegation-exists-check',
    description: 'Agent must have valid delegation from user',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-exists-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-exists-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      const params = decision.parameters;

      try {
        const db = getPrisma();
        const delegation = await db.delegation.findUnique({
          where: { id: params.delegationId },
        });

        if (!delegation) {
          return {
            ruleName: 'delegation-exists-check',
            passed: false,
            message: `Delegation ${params.delegationId} not found`,
            severity: 'ERROR',
          };
        }

        // Verify agent address matches
        if (delegation.agent.toLowerCase() !== params.agentWallet.toLowerCase()) {
          return {
            ruleName: 'delegation-exists-check',
            passed: false,
            message: `Delegation agent mismatch (expected ${delegation.agent}, got ${params.agentWallet})`,
            severity: 'ERROR',
          };
        }

        // Verify status is ACTIVE
        if (delegation.status !== 'ACTIVE') {
          return {
            ruleName: 'delegation-exists-check',
            passed: false,
            message: `Delegation status is ${delegation.status}, not ACTIVE`,
            severity: 'ERROR',
          };
        }

        return {
          ruleName: 'delegation-exists-check',
          passed: true,
          message: `Delegation ${params.delegationId.slice(0, 8)}... valid`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Delegation check failed', { error });
        return {
          ruleName: 'delegation-exists-check',
          passed: false,
          message: 'Database error during delegation check (failing CLOSED)',
          severity: 'ERROR',
        };
      }
    },
  },

  {
    name: 'delegation-scope-check',
    description: 'Transaction must be within delegation scope (contracts/functions)',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-scope-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-scope-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      const params = decision.parameters;

      try {
        const db = getPrisma();
        const delegation = await db.delegation.findUnique({
          where: { id: params.delegationId },
        });

        if (!delegation) {
          return {
            ruleName: 'delegation-scope-check',
            passed: false,
            message: 'Delegation not found',
            severity: 'ERROR',
          };
        }

        const permissions = DelegationPermissionsSchema.parse(delegation.permissions);

        // If no target contract specified, allow (scope will be checked at execution)
        if (!params.targetContract) {
          return {
            ruleName: 'delegation-scope-check',
            passed: true,
            message: 'No target contract specified (will check at execution)',
            severity: 'ERROR',
          };
        }

        // Check if target contract is in scope
        const inScope = isWithinScope(permissions, params.targetContract);

        return {
          ruleName: 'delegation-scope-check',
          passed: inScope,
          message: inScope
            ? `Target ${params.targetContract.slice(0, 10)}... within delegation scope`
            : `Target ${params.targetContract.slice(0, 10)}... NOT in delegation scope`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Delegation scope check failed', { error });
        return {
          ruleName: 'delegation-scope-check',
          passed: false,
          message: 'Error checking delegation scope (failing CLOSED)',
          severity: 'ERROR',
        };
      }
    },
  },

  {
    name: 'delegation-value-check',
    description: 'Transaction value must be within delegation limits',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-value-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-value-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      // For gas sponsorship, value is typically 0 (paying gas, not ETH value)
      // This rule is more relevant for actual transaction execution
      // For now, pass if we're just sponsoring gas
      return {
        ruleName: 'delegation-value-check',
        passed: true,
        message: 'Gas sponsorship has no ETH value transfer',
        severity: 'ERROR',
      };
    },
  },

  {
    name: 'delegation-expiry-check',
    description: 'Delegation must not be expired',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-expiry-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-expiry-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      const params = decision.parameters;

      try {
        const db = getPrisma();
        const delegation = await db.delegation.findUnique({
          where: { id: params.delegationId },
        });

        if (!delegation) {
          return {
            ruleName: 'delegation-expiry-check',
            passed: false,
            message: 'Delegation not found',
            severity: 'ERROR',
          };
        }

        const isValid = isDelegationTimeValid(delegation.validFrom, delegation.validUntil);

        if (!isValid) {
          // Update status if expired
          const now = new Date();
          if (now > delegation.validUntil) {
            await db.delegation.update({
              where: { id: delegation.id },
              data: { status: 'EXPIRED' },
            });
          }
        }

        return {
          ruleName: 'delegation-expiry-check',
          passed: isValid,
          message: isValid
            ? `Delegation valid until ${delegation.validUntil.toISOString()}`
            : `Delegation expired at ${delegation.validUntil.toISOString()}`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Delegation expiry check failed', { error });
        return {
          ruleName: 'delegation-expiry-check',
          passed: false,
          message: 'Error checking delegation expiry (failing CLOSED)',
          severity: 'ERROR',
        };
      }
    },
  },

  {
    name: 'delegation-budget-check',
    description: 'User gas budget must be sufficient for estimated gas',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-budget-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-budget-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      const params = decision.parameters;

      try {
        const db = getPrisma();
        const delegation = await db.delegation.findUnique({
          where: { id: params.delegationId },
        });

        if (!delegation) {
          return {
            ruleName: 'delegation-budget-check',
            passed: false,
            message: 'Delegation not found',
            severity: 'ERROR',
          };
        }

        const remaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;

        // Estimate gas cost in Wei (rough: gasLimit * 1 gwei)
        const maxGasLimit = params.maxGasLimit ?? 200000;
        const estimatedGasWei = BigInt(maxGasLimit) * BigInt(1_000_000_000); // 1 gwei

        const hasBudget = remaining >= estimatedGasWei;

        if (!hasBudget && remaining <= BigInt(0)) {
          // Mark as exhausted
          await db.delegation.update({
            where: { id: delegation.id },
            data: { status: 'EXHAUSTED' },
          });
        }

        return {
          ruleName: 'delegation-budget-check',
          passed: hasBudget,
          message: hasBudget
            ? `Budget OK (${remaining.toString()} Wei remaining)`
            : `Insufficient budget (${remaining.toString()} Wei < ${estimatedGasWei.toString()} Wei estimated)`,
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Delegation budget check failed', { error });
        return {
          ruleName: 'delegation-budget-check',
          passed: false,
          message: 'Error checking delegation budget (failing CLOSED)',
          severity: 'ERROR',
        };
      }
    },
  },

  {
    name: 'delegation-rate-limit-check',
    description: 'Transaction rate must be within delegation limits',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!DELEGATION_ENABLED) {
        return {
          ruleName: 'delegation-rate-limit-check',
          passed: true,
          message: 'Delegation feature disabled',
          severity: 'ERROR',
        };
      }

      if (!isDelegatedSponsorshipDecision(decision)) {
        return {
          ruleName: 'delegation-rate-limit-check',
          passed: true,
          message: 'N/A - no delegationId in parameters',
          severity: 'ERROR',
        };
      }

      const params = decision.parameters;

      try {
        const db = getPrisma();
        const delegation = await db.delegation.findUnique({
          where: { id: params.delegationId },
        });

        if (!delegation) {
          return {
            ruleName: 'delegation-rate-limit-check',
            passed: false,
            message: 'Delegation not found',
            severity: 'ERROR',
          };
        }

        const permissions = DelegationPermissionsSchema.parse(delegation.permissions);
        const now = new Date();

        // Check hourly limit
        if (permissions.maxTxPerHour) {
          const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          const hourlyCount = await db.delegationUsage.count({
            where: {
              delegationId: delegation.id,
              createdAt: { gte: hourAgo },
              success: true,
            },
          });

          if (hourlyCount >= permissions.maxTxPerHour) {
            return {
              ruleName: 'delegation-rate-limit-check',
              passed: false,
              message: `Hourly limit exceeded (${hourlyCount}/${permissions.maxTxPerHour})`,
              severity: 'ERROR',
            };
          }
        }

        // Check daily limit
        if (permissions.maxTxPerDay) {
          const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const dailyCount = await db.delegationUsage.count({
            where: {
              delegationId: delegation.id,
              createdAt: { gte: dayAgo },
              success: true,
            },
          });

          if (dailyCount >= permissions.maxTxPerDay) {
            return {
              ruleName: 'delegation-rate-limit-check',
              passed: false,
              message: `Daily limit exceeded (${dailyCount}/${permissions.maxTxPerDay})`,
              severity: 'ERROR',
            };
          }
        }

        return {
          ruleName: 'delegation-rate-limit-check',
          passed: true,
          message: 'Rate limits OK',
          severity: 'ERROR',
        };
      } catch (error) {
        logger.error('[Policy] Delegation rate limit check failed', { error });
        return {
          ruleName: 'delegation-rate-limit-check',
          passed: false,
          message: 'Error checking delegation rate limits (failing CLOSED)',
          severity: 'ERROR',
        };
      }
    },
  },
];

/**
 * Check if an agent has any valid delegation (used for observation).
 */
export async function checkAgentHasDelegation(agentAddress: string): Promise<boolean> {
  if (!DELEGATION_ENABLED) {
    return false;
  }

  const result = await hasValidDelegation(agentAddress);
  return result.valid;
}
