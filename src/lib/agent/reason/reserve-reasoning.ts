/**
 * Reserve Pipeline reasoning: analyzes reserve observations and proposes
 * REPLENISH_RESERVES, ALLOCATE_BUDGET, ALERT_LOW_RUNWAY, REBALANCE_RESERVES, or WAIT.
 */

import { logger } from '../../logger';
import { generateReserveDecision } from './reserve-prompt';
import { DecisionSchema, type Decision } from './schemas';
import type { ReasoningContext } from './index';

/**
 * Reserve-specific reasoning: analyzes reserve pipeline observations
 * and proposes a supply-side action.
 */
export async function reasonAboutReserves(
  observations: unknown[],
  memories: unknown[]
): Promise<Decision> {
  const context: ReasoningContext = {
    observations,
    memories,
    constraints: [
      'REPLENISH_RESERVES when ETH below target and USDC available; maintain 20% USDC buffer',
      'ALLOCATE_BUDGET when CONFIRMED payments exist; match paymentHash to protocol',
      'ALERT_LOW_RUNWAY when runway < threshold and no replenishment possible',
      'REBALANCE_RESERVES when ETH/USDC ratio drifts from target (e.g. 70/30)',
      'WAIT when reserves healthy and no pending payments',
    ],
  };

  try {
    const decision = await generateReserveDecision(context);
    const validated = DecisionSchema.parse(decision);
    logger.info('[Reason] Reserve decision', { action: validated.action, confidence: validated.confidence });
    return validated;
  } catch (error) {
    logger.error('[Reason] Reserve pipeline reasoning failed', {
      error,
      severity: 'HIGH',
      impact: 'Reserve pipeline may not replenish or allocate',
    });
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: `Error during reserve reasoning: ${error}`,
      parameters: null,
      metadata: {
        reasoningFailed: true,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
