/**
 * Aegis Agent - Prompt Engineering
 * 
 * Defines prompts for LLM reasoning with structured outputs.
 * Uses OpenAI's function calling for reliable decision generation.
 */

import OpenAI from 'openai';
import { DecisionSchema, type Decision } from './schemas';
import type { ReasoningContext } from './index';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * System prompt that defines the agent's role and constraints
 */
const SYSTEM_PROMPT = `You are Aegis, an AI agent that manages blockchain treasury operations.
Your role is to observe on-chain state, reason about what actions to take, and make decisions.

CRITICAL RULES:
1. You MUST return a valid decision in the exact JSON format specified
2. Never propose actions you're not confident about - prefer WAIT when uncertain
3. Always consider gas costs and market conditions
4. Explain your reasoning clearly
5. If confidence is below 0.7, you MUST choose WAIT

Available actions:
- EXECUTE: Execute a smart contract call
- WAIT: Do nothing and continue observing
- ALERT_HUMAN: Request human review for important decisions
- REBALANCE: Adjust portfolio allocation
- SWAP: Exchange one token for another
- TRANSFER: Send tokens to an address

Your confidence score should reflect:
- Data quality (is the observation data fresh and complete?)
- Market conditions (is it a good time to act?)
- Risk assessment (what could go wrong?)
- Historical success (have similar actions succeeded before?)`;

/**
 * Generate a decision from observations using OpenAI
 */
export async function generateDecision(context: ReasoningContext): Promise<Decision> {
  const { observations, memories, constraints } = context;

  const userPrompt = `
Current Observations:
${JSON.stringify(observations, null, 2)}

Relevant Past Experiences:
${memories.length > 0 ? JSON.stringify(memories, null, 2) : 'No relevant memories found.'}

${constraints ? `Additional Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}` : ''}

Based on the above, what action should be taken? Analyze the situation and provide your decision.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      functions: [
        {
          name: 'make_decision',
          description: 'Make a decision about what action the agent should take',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['EXECUTE', 'WAIT', 'ALERT_HUMAN', 'REBALANCE', 'SWAP', 'TRANSFER'],
                description: 'The action to take',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence score from 0 to 1',
              },
              reasoning: {
                type: 'string',
                description: 'Explanation of why this action was chosen',
              },
              parameters: {
                type: 'object',
                description: 'Action-specific parameters (null for WAIT)',
                nullable: true,
              },
              preconditions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Conditions that should be met before execution',
              },
              expectedOutcome: {
                type: 'string',
                description: 'What outcome is expected from this action',
              },
            },
            required: ['action', 'confidence', 'reasoning', 'parameters'],
          },
        },
      ],
      function_call: { name: 'make_decision' },
      temperature: 0.2, // Lower temperature for more consistent decisions
    });

    const functionCall = response.choices[0]?.message?.function_call;
    
    if (!functionCall?.arguments) {
      throw new Error('No function call in response');
    }

    const decision = JSON.parse(functionCall.arguments);
    return DecisionSchema.parse(decision);
  } catch (error) {
    console.error('[Prompts] Error generating decision:', error);
    throw error;
  }
}

/**
 * Generate a decision using Anthropic Claude (alternative)
 */
export async function generateDecisionWithClaude(context: ReasoningContext): Promise<Decision> {
  // TODO: Implement Claude-based reasoning using @anthropic-ai/sdk
  // This provides an alternative LLM for comparison or fallback
  throw new Error('Claude reasoning not yet implemented');
}
