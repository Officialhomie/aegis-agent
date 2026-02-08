/**
 * Aegis Agent - Reserve Pipeline Prompts
 *
 * LLM prompts for the supply-side mode: evaluate reserve health, burn rate,
 * runway, pending payments, and output REPLENISH_RESERVES, ALLOCATE_BUDGET,
 * ALERT_LOW_RUNWAY, REBALANCE_RESERVES, or WAIT.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DecisionSchema, type Decision } from './schemas';
import type { ReasoningContext } from './index';
import { maskSensitiveData } from '../../security/data-masking';
import { compressObservations } from './observation-compressor';
import type { Observation } from '../observe';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Tool definition for reserve pipeline decisions */
export const RESERVE_DECISION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'make_reserve_decision',
    description:
      'Decide reserve pipeline action: replenish reserves, allocate budget, alert low runway, rebalance, or wait',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['REPLENISH_RESERVES', 'ALLOCATE_BUDGET', 'ALERT_LOW_RUNWAY', 'REBALANCE_RESERVES', 'WAIT'],
          description:
            'Action: convert USDC to ETH, allocate x402 payment to protocol, alert low runway, rebalance ETH/USDC ratio, or wait',
        },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence 0-1' },
        reasoning: { type: 'string', description: 'Why this action' },
        parameters: {
          type: 'object',
          description:
            'For REPLENISH_RESERVES: { tokenIn: "USDC", tokenOut: "ETH", amountIn, slippageTolerance?, reason }. For ALLOCATE_BUDGET: { protocolId, paymentHash, amountUSD, currency }. For ALERT_LOW_RUNWAY: { currentRunwayDays, thresholdDays, ethBalance, dailyBurnRate, severity, suggestedAction }. For REBALANCE_RESERVES: { currentETH, currentUSDC, targetRatioETH?, swapAmount, swapDirection }. Null for WAIT.',
          nullable: true,
        },
        preconditions: { type: 'array', items: { type: 'string' } },
        expectedOutcome: { type: 'string' },
      },
      required: ['action', 'confidence', 'reasoning', 'parameters'],
    },
  },
};

const SYSTEM_PROMPT_RESERVE = `You are Aegis Reserve Pipeline - the supply-side engine for a gas sponsorship economy on Base.

Your role: Ensure the gas sponsorship agent always has enough ETH reserves to operate.

OBSERVATIONS you receive:
- Agent ETH and USDC balances
- Protocol budgets (x402 payment balances)
- Burn rate (sponsorships per day, ETH consumed per day)
- Runway (days of sponsorship remaining at current burn rate)
- Pending x402 payments awaiting allocation
- Current gas price on Base
- ETH/USD price
- Optional: forecasted burn rate, emergency mode

ACTIONS you can take:
1. REPLENISH_RESERVES - Convert USDC to ETH when reserves are below target
   Use when: ETH balance < target AND USDC balance sufficient for swap
   Parameters: tokenIn "USDC", tokenOut "ETH", amountIn (string), slippageTolerance (0-0.05), reason: "below_target" | "high_burn_rate" | "scheduled"

2. ALLOCATE_BUDGET - Assign pending x402 payment to a protocol's sponsorship budget
   Use when: There are CONFIRMED payments not yet allocated
   Parameters: protocolId, paymentHash, amountUSD, currency

3. ALERT_LOW_RUNWAY - Send alert when runway drops below threshold
   Use when: Runway < threshold days AND no USDC available for replenishment
   Parameters: currentRunwayDays, thresholdDays, ethBalance, dailyBurnRate, severity ("MEDIUM"|"HIGH"|"CRITICAL"), suggestedAction

4. REBALANCE_RESERVES - Maintain target ETH/USDC allocation ratio
   Use when: Ratio drifts significantly from target (e.g., 70/30)
   Parameters: currentETH, currentUSDC, targetRatioETH (0-1), swapAmount (string), swapDirection "USDC_TO_ETH" or "ETH_TO_USDC"

5. WAIT - No action needed, reserves are healthy
   Use when: ETH above target, runway above threshold, no pending payments

DECISION RULES:
- REPLENISH_RESERVES takes priority when ETH < critical threshold
- Never swap more USDC than needed to reach target ETH
- Always maintain a USDC buffer (at least 20% of total reserves in USDC)
- ALERT_LOW_RUNWAY when runway < 3 days (CRITICAL) or < 7 days (HIGH)
- WAIT when health score > 80 and no pending payments
- Return a single decision in the exact JSON format required.`;

/**
 * Generate a reserve pipeline decision from observations and memories.
 */
export async function generateReserveDecision(context: ReasoningContext): Promise<Decision> {
  const { observations, memories, constraints } = context;
  const maskedObservations = maskSensitiveData(observations);
  const compressedObservations = compressObservations(maskedObservations as Observation[]);
  const maskedMemories = maskSensitiveData(memories);

  const userPrompt = `
Current observations (reserves, burn rate, runway, pending payments, gas price, ETH/USD):
${JSON.stringify(compressedObservations, null, 2)}

Relevant past experiences:
${maskedMemories && Array.isArray(maskedMemories) && maskedMemories.length > 0 ? JSON.stringify(maskedMemories, null, 2) : 'None.'}

${constraints ? `Constraints:\n${constraints.map((c) => `- ${c}`).join('\n')}` : ''}

Based on the above, choose one action: REPLENISH_RESERVES, ALLOCATE_BUDGET, ALERT_LOW_RUNWAY, REBALANCE_RESERVES, or WAIT. Provide your decision in the required JSON format.`;

  const useClaude = process.env.USE_CLAUDE_REASONING === 'true' && process.env.ANTHROPIC_API_KEY;
  if (useClaude) {
    return generateReserveDecisionWithClaude(userPrompt);
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_REASONING_MODEL ?? 'gpt-4-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_RESERVE },
      { role: 'user', content: userPrompt },
    ],
    tools: [RESERVE_DECISION_TOOL],
    tool_choice: { type: 'function', function: { name: 'make_reserve_decision' } },
    temperature: 0.2,
  });

  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (tc) => (tc as { function?: { name?: string; arguments?: string } }).function?.name === 'make_reserve_decision'
  ) as { function: { arguments: string } } | undefined;

  if (!toolCall?.function?.arguments) {
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: 'No tool call in response',
      parameters: null,
      metadata: { reasoningFailed: true, error: 'No tool call' },
    };
  }

  const parsed = JSON.parse(toolCall.function.arguments) as unknown;
  return DecisionSchema.parse(parsed);
}

async function generateReserveDecisionWithClaude(userPrompt: string): Promise<Decision> {
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT_RESERVE,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find((b) => b.type === 'text')?.type === 'text' ? (response.content.find((b) => b.type === 'text') as { text: string }).text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      action: 'WAIT',
      confidence: 0,
      reasoning: 'No JSON in Claude response',
      parameters: null,
      metadata: { reasoningFailed: true, error: 'No JSON' },
    };
  }
  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  return DecisionSchema.parse(parsed);
}
