/**
 * Aegis Agent - Reasoning Layer
 * 
 * Uses LLM (OpenAI/Anthropic) with structured outputs to analyze observations
 * and propose actions. Implements the decision-making logic with constraints.
 */

import { generateDecision } from './prompts';
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

export { generateDecision } from './prompts';
export { DecisionSchema, type Decision } from './schemas';
