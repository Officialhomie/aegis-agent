/**
 * Aegis Agent - Prompt Engineering
 *
 * Defines prompts for LLM reasoning with structured outputs.
 * Uses OpenAI tools API and Anthropic Claude for decision generation.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DecisionSchema, type Decision } from './schemas';
import type { ReasoningContext } from './index';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DECISION_TOOL = {
  type: 'function' as const,
  function: {
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
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence score from 0 to 1' },
        reasoning: { type: 'string', description: 'Explanation of why this action was chosen' },
        parameters: { type: 'object', description: 'Action-specific parameters (null for WAIT)', nullable: true },
        preconditions: { type: 'array', items: { type: 'string' }, description: 'Conditions before execution' },
        expectedOutcome: { type: 'string', description: 'Expected outcome' },
      },
      required: ['action', 'confidence', 'reasoning', 'parameters'],
    },
  },
};

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

  const useClaude = process.env.USE_CLAUDE_REASONING === 'true' && process.env.ANTHROPIC_API_KEY;
  if (useClaude) {
    return generateDecisionWithClaude(context);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_REASONING_MODEL ?? 'gpt-4-turbo',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      tools: [DECISION_TOOL],
      tool_choice: { type: 'function', function: { name: 'make_decision' } },
      temperature: 0.2,
    });

    const message = response.choices[0]?.message;
    const toolCall = message?.tool_calls?.find((tc) => (tc as { function?: { name?: string; arguments?: string } }).function?.name === 'make_decision') as
      | { function: { arguments: string } }
      | undefined;
    const args = toolCall?.function?.arguments;

    if (!args) {
      throw new Error('No tool call in response');
    }

    const decision = JSON.parse(args);
    return DecisionSchema.parse(decision);
  } catch (error) {
    console.error('[Prompts] Error generating decision:', error);
    throw error;
  }
}

/**
 * Generate a decision using Anthropic Claude
 */
export async function generateDecisionWithClaude(context: ReasoningContext): Promise<Decision> {
  const { observations, memories, constraints } = context;

  const userContent = `
Current Observations:
${JSON.stringify(observations, null, 2)}

Relevant Past Experiences:
${memories.length > 0 ? JSON.stringify(memories, null, 2) : 'No relevant memories found.'}

${constraints ? `Additional Constraints:\n${constraints.map((c) => `- ${c}`).join('\n')}` : ''}

Based on the above, respond with a single JSON object for your decision with exactly these keys: action, confidence, reasoning, parameters (use null for WAIT).
Action must be one of: EXECUTE, WAIT, ALERT_HUMAN, REBALANCE, SWAP, TRANSFER.
Confidence is a number between 0 and 1.
Respond with only the JSON, no other text.
`;

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text in Claude response');
  }

  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const decision = JSON.parse(jsonStr);
  return DecisionSchema.parse(decision);
}
