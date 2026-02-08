/**
 * Aegis Agent - Reasoning Layer
 * 
 * Uses LLM (OpenAI/Anthropic) with structured outputs to analyze observations
 * and propose actions. Implements the decision-making logic with constraints.
 */

import { logger } from '../../logger';
import { incrementCounter } from '../../monitoring/metrics';
import { generateSponsorshipDecision } from './sponsorship-prompt';
import { DecisionSchema, type Decision } from './schemas';
import { getTemplateDecision } from './template-responses';
import type { Observation } from '../observe';

export interface ReasoningContext {
  observations: unknown[];
  memories: unknown[];
  constraints?: string[];
}

/**
 * Sponsorship-specific reasoning: analyzes Base sponsorship opportunities
 * and proposes SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL, or WAIT.
 */
export async function reasonAboutSponsorship(
  observations: unknown[],
  memories: unknown[]
): Promise<Decision> {
  // Check if a template decision can be used (deterministic scenarios)
  const gasPriceMaxGwei = parseFloat(process.env.MAX_GAS_PRICE_GWEI ?? '2');
  const templateDecision = getTemplateDecision(observations as Observation[], gasPriceMaxGwei);

  if (templateDecision) {
    incrementCounter('aegis_template_response_used', 1);
    logger.info('[Reason] Using template decision (no LLM call)', {
      action: templateDecision.action,
      confidence: templateDecision.confidence,
      template: templateDecision.metadata?.template,
    });
    return templateDecision;
  }

  incrementCounter('aegis_llm_calls_total', 1);
  logger.debug('[Reason] No template match - invoking LLM reasoning');

  const context: ReasoningContext = {
    observations,
    memories,
    constraints: [
      'Prefer WAIT when gas price exceeds 2 Gwei or confidence < 0.8',
      'Only one SPONSOR_TRANSACTION per decision; pick highest-legitimacy user',
      'SWAP_RESERVES only when agent ETH below threshold and USDC available',
      'ALERT_PROTOCOL when protocol budget critically low',
    ],
  };

  try {
    const decision = await generateSponsorshipDecision(context);
    const validated = DecisionSchema.parse(decision);
    logger.info('[Reason] LLM sponsorship decision', { action: validated.action, confidence: validated.confidence });
    return validated;
  } catch (error) {
    logger.error('[Reason] LLM sponsorship reasoning failed', {
      error,
      severity: 'HIGH',
      impact: 'Agent cannot generate sponsorship decisions - may be stuck in WAIT loop',
    });
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: `Error during sponsorship reasoning: ${error}`,
      parameters: null,
      metadata: {
        reasoningFailed: true,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export { generateSponsorshipDecision } from './sponsorship-prompt';
export { reasonAboutReserves } from './reserve-reasoning';
export { generateReserveDecision } from './reserve-prompt';
export { DecisionSchema, type Decision } from './schemas';
