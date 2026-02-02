/**
 * Aegis Agent - Reasoning Layer
 * 
 * Uses LLM (OpenAI/Anthropic) with structured outputs to analyze observations
 * and propose actions. Implements the decision-making logic with constraints.
 */

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
    
    console.log('[Reason] Generated decision:', {
      action: validated.action,
      confidence: validated.confidence,
    });

    return validated;
  } catch (error) {
    console.error('[Reason] Error generating decision:', error);
    
    // Return a safe default decision on error
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: `Error during reasoning: ${error}`,
      parameters: null,
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
    console.log('[Reason] Sponsorship decision:', { action: validated.action, confidence: validated.confidence });
    return validated;
  } catch (error) {
    console.error('[Reason] Error generating sponsorship decision:', error);
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: `Error during sponsorship reasoning: ${error}`,
      parameters: null,
    };
  }
}

export { generateDecision } from './prompts';
export { generateSponsorshipDecision } from './sponsorship-prompt';
export { DecisionSchema, type Decision } from './schemas';
