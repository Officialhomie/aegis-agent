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
import type { AlertParams, AlertProtocolParams } from '../reason/schemas';

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
  if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN') {
    return { valid: true };
  }
  if (['TRANSFER', 'SWAP', 'REBALANCE', 'EXECUTE'].includes(decision.action) && !decision.parameters) {
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
export { getDefaultCircuitBreaker, CircuitBreaker } from './circuit-breaker';
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
