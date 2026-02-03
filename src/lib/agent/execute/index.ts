/**
 * Aegis Agent - Execution Layer
 *
 * Handles the actual execution of decisions using Coinbase AgentKit.
 * The LLM never directly accesses this layer - all actions pass through policy first.
 */

import { logger } from '../../logger';
import { executeWithAgentKit } from './agentkit';
import { sendAlert } from './alerts';
import { getDefaultCircuitBreaker } from './circuit-breaker';
import { sponsorTransaction } from './paymaster';
import { executeReserveSwap } from './reserve-manager';
import type { Decision } from '../reason/schemas';
import type { AlertParams, AlertProtocolParams, AlertRunwayParams } from '../reason/schemas';

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
  simulationResult?: unknown;
}

/**
 * Validate decision parameters before LIVE execution (lightweight pre-flight).
 * Full viem.simulateTransaction can be added when building raw transactions.
 */
function validateForLiveExecution(decision: Decision): { valid: boolean; error?: string } {
  const action = decision.action;
  if (action === 'WAIT' || action === 'ALERT_HUMAN') {
    return { valid: true };
  }
  const noParamActions = ['ALERT_PROTOCOL', 'ALERT_LOW_RUNWAY'];
  if (!decision.parameters && !noParamActions.includes(action)) {
    return { valid: false, error: 'Parameters required for this action' };
  }
  return { valid: true };
}

/**
 * Execute a decision (either live or in simulation mode)
 */
export async function execute(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION' = 'SIMULATION'
): Promise<ExecutionResult> {
  logger.info('[Execute] Processing decision', { mode, action: decision.action });

  try {
    if (decision.action === 'WAIT') {
      return {
        success: true,
        simulationResult: 'WAIT action - no execution needed',
      };
    }

    if (decision.action === 'ALERT_HUMAN') {
      const params = decision.parameters as AlertParams | null;
      if (params?.message) {
        await sendAlert({
          severity: params.severity ?? 'MEDIUM',
          message: params.message,
          suggestedAction: params.suggestedAction,
        });
      } else {
        logger.warn('[Execute] ALERT_HUMAN (no params)', { parameters: decision.parameters });
      }
      return {
        success: true,
        simulationResult: 'Human alerted',
      };
    }

    if (decision.action === 'ALERT_PROTOCOL') {
      const params = decision.parameters as AlertProtocolParams | null;
      const message = params
        ? `Protocol ${params.protocolId}: budget $${params.budgetRemaining.toFixed(2)} remaining (~${params.estimatedDaysRemaining ?? '?'} days). ${params.topUpRecommendation != null ? `Top-up recommendation: $${params.topUpRecommendation.toFixed(2)}` : ''}`
        : 'Protocol budget low';
      await sendAlert({
        severity: (params?.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'HIGH',
        message,
        suggestedAction: 'Top up protocol sponsorship budget via x402',
      });
      return { success: true, simulationResult: 'Protocol alerted' };
    }

    if (decision.action === 'SPONSOR_TRANSACTION') {
      return await sponsorTransaction(decision, mode);
    }

    if (decision.action === 'SWAP_RESERVES') {
      return await executeReserveSwap(decision, mode);
    }

    if (decision.action === 'REPLENISH_RESERVES') {
      return await executeReserveSwap({ ...decision, action: 'SWAP_RESERVES', parameters: decision.parameters }, mode);
    }

    if (decision.action === 'ALERT_LOW_RUNWAY') {
      const params = decision.parameters as AlertRunwayParams | null;
      const message = params
        ? `Low runway: ${params.currentRunwayDays.toFixed(1)} days (threshold ${params.thresholdDays}). ETH: ${params.ethBalance.toFixed(4)}, burn: ${params.dailyBurnRate.toFixed(6)} ETH/day.`
        : 'Reserve runway below threshold';
      await sendAlert({ severity: 'HIGH', message, suggestedAction: 'Replenish reserves or reduce sponsorship rate' });
      return { success: true, simulationResult: 'Low runway alert sent' };
    }

    if (decision.action === 'ALLOCATE_BUDGET' || decision.action === 'REBALANCE_RESERVES') {
      return { success: true, simulationResult: `${decision.action} acknowledged (execution TBD)` };
    }

    if (mode === 'LIVE') {
      const validation = validateForLiveExecution(decision);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      const breaker = getDefaultCircuitBreaker();
      return await breaker.execute(() => executeWithAgentKit(decision, mode));
    }

    return await executeWithAgentKit(decision, mode);
  } catch (error) {
    logger.error('[Execute] Execution error', { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: `Execution failed: ${error instanceof Error ? error.message : error}`,
    };
  }
}

export { executeWithAgentKit } from './agentkit';
export { sendAlert } from './alerts';
export { getCircuitBreaker, getDefaultCircuitBreaker, CircuitBreaker } from './circuit-breaker';
export { executeWithWalletLock } from './wallet-lock';
export {
  sponsorTransaction,
  signDecision,
  verifyDecisionSignature,
  logSponsorshipOnchain,
  deductProtocolBudget,
  type SignedDecision,
  type SponsorshipExecutionResult,
} from './paymaster';
export { manageReserves, executeReserveSwap } from './reserve-manager';
export {
  prioritizeOpportunities,
  type SponsorshipOpportunity,
  type PrioritizedOpportunity,
} from './protocol-priority';
