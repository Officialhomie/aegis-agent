/**
 * Aegis Agent - Reasoning Layer
 * 
 * Uses LLM (OpenAI/Anthropic) with structured outputs to analyze observations
 * and propose actions. Implements the decision-making logic with constraints.
 */

import { logger } from '../../logger';
import { generateDecision } from './prompts';
import { generateSponsorshipDecision } from './sponsorship-prompt';
import { DecisionSchema, type Decision } from './schemas';

export interface ReasoningContext {
  observations: unknown[];
  memories: unknown[];
  constraints?: string[];
}

/**
 * Main reasoning function - analyzes observations and proposes an action
 */
export async function reason(
  observations: unknown[],
  memories: unknown[]
): Promise<Decision> {
  const context: ReasoningContext = {
    observations,
    memories,
    constraints: [
      'Never propose actions with value exceeding the configured maximum',
      'Always include reasoning for the decision',
      'When uncertain, prefer WAIT over EXECUTE',
      'Consider gas costs in transaction decisions',
    ],
  };

  try {
    const decision = await generateDecision(context);
    
    // Validate the decision against our schema
    const validated = DecisionSchema.parse(decision);
    
    logger.info('[Reason] Generated decision', {
      action: validated.action,
      confidence: validated.confidence,
    });

    return validated;
  } catch (error) {
    logger.error('[Reason] LLM reasoning failed', {
      error,
      severity: 'HIGH',
      impact: 'Agent cannot generate decisions - may be stuck in WAIT loop',
    });
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: `Error during reasoning: ${error}`,
      parameters: null,
      metadata: {
        reasoningFailed: true,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Sponsorship-specific reasoning: analyzes Base sponsorship opportunities
 * and proposes SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL, or WAIT.
 */
export async function reasonAboutSponsorship(
  observations: unknown[],
  memories: unknown[]
): Promise<Decision> {
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
    logger.info('[Reason] Sponsorship decision', { action: validated.action, confidence: validated.confidence });
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

export { generateDecision } from './prompts';
export { generateSponsorshipDecision } from './sponsorship-prompt';
export { DecisionSchema, type Decision } from './schemas';
