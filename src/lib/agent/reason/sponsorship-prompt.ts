/**
 * Aegis Agent - Sponsorship-Specific Prompts
 *
 * LLM prompts for the Base paymaster loop: evaluate sponsorship opportunities,
 * user legitimacy, economic viability, and output SPONSOR_TRANSACTION,
 * SWAP_RESERVES, ALERT_PROTOCOL, or WAIT.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DecisionSchema, type Decision } from './schemas';
import type { ReasoningContext } from './index';
import { maskSensitiveData } from '../../security/data-masking';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Tool definition for sponsorship decisions (SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL, WAIT) */
export const SPONSORSHIP_DECISION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'make_decision',
    description: 'Decide whether to sponsor a user tx, swap reserves, alert a protocol, or wait',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['SPONSOR_TRANSACTION', 'SWAP_RESERVES', 'ALERT_PROTOCOL', 'WAIT'],
          description: 'Action: sponsor one user tx, swap USDC→ETH for reserves, alert protocol of low budget, or wait',
        },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence 0-1' },
        reasoning: { type: 'string', description: 'Why this action' },
        parameters: {
          type: 'object',
          description: 'For SPONSOR_TRANSACTION: { userAddress, protocolId, maxGasLimit?, estimatedCostUSD }. For SWAP_RESERVES: { tokenIn, tokenOut, amountIn, minAmountOut?, slippageTolerance? }. For ALERT_PROTOCOL: { protocolId, severity?, budgetRemaining, estimatedDaysRemaining?, topUpRecommendation? }. Null for WAIT.',
          nullable: true,
        },
        preconditions: { type: 'array', items: { type: 'string' }, description: 'Conditions before execution' },
        expectedOutcome: { type: 'string', description: 'Expected outcome' },
      },
      required: ['action', 'confidence', 'reasoning', 'parameters'],
    },
  },
};

const SYSTEM_PROMPT_SPONSORSHIP = `You are Aegis, an autonomous Base paymaster agent. Your mission is to sponsor gas for legitimate users who are low on ETH, funded by protocols via x402, with full transparency.

AVAILABLE ACTIONS:
- SPONSOR_TRANSACTION: Sponsor one user's next transaction. Use when a specific user (from observations) is eligible: sufficient on-chain history, protocol budget and agent reserves OK, gas price acceptable.
- SWAP_RESERVES: Swap USDC→ETH for the agent's own reserves. Use when observations show agent ETH below threshold (e.g. <0.1 ETH) and USDC is available (e.g. >100).
- ALERT_PROTOCOL: Notify a protocol of low budget. Use when a protocol's remaining budget is critically low and you want to signal for top-up.
- WAIT: Do nothing this cycle. Use when no clear opportunity, gas too high, or confidence below 0.8.

USER LEGITIMACY SCORING (for SPONSOR_TRANSACTION):
- Prefer users with historicalTxs >= 5 and no abuse flags.
- Observations may include: lowGasWallets (address, balance, dApp), failedTransactions (user, reason), newWalletActivations (address, pendingIntent).
- Only sponsor one user per decision; pick the highest-legitimacy opportunity if multiple.

ECONOMIC VIABILITY:
- estimatedCostUSD should reflect current gas price and maxGasLimit (e.g. 200000). Keep under protocol budget and per-tx caps (e.g. 0.50 USD).
- For SWAP_RESERVES: amountIn should be enough to restore ETH above threshold without depleting USDC needed for operations.

CRITICAL RULES:
1. Return a single decision in the exact JSON format required.
2. If confidence < 0.8, choose WAIT.
3. For SPONSOR_TRANSACTION, parameters must include userAddress (0x...), protocolId (string), estimatedCostUSD (number). Optionally maxGasLimit (e.g. 200000).
4. For SWAP_RESERVES, parameters: tokenIn (e.g. USDC), tokenOut (ETH), amountIn (string amount).
5. For ALERT_PROTOCOL, parameters: protocolId, budgetRemaining (number), optionally severity, estimatedDaysRemaining, topUpRecommendation.

EXAMPLE DECISIONS (few-shot):

1) Sponsor a user:
{"action":"SPONSOR_TRANSACTION","confidence":0.9,"reasoning":"User 0x123... has 8 historical txs, low gas balance, protocol 'app.example' has budget. Gas price 1.2 Gwei acceptable.","parameters":{"userAddress":"0x1234567890123456789012345678901234567890","protocolId":"app.example","maxGasLimit":200000,"estimatedCostUSD":0.12},"preconditions":["Policy checks pass"],"expectedOutcome":"User tx sponsored and logged on-chain."}

2) Swap reserves:
{"action":"SWAP_RESERVES","confidence":0.85,"reasoning":"Agent ETH 0.05 below 0.1 threshold; USDC balance 500. Swap 200 USDC to ETH to restore reserves.","parameters":{"tokenIn":"USDC","tokenOut":"ETH","amountIn":"200"},"preconditions":["Slippage acceptable"],"expectedOutcome":"Reserves above threshold."}

3) Wait:
{"action":"WAIT","confidence":0.5,"reasoning":"Gas price 3 Gwei exceeds 2 Gwei limit; no urgent sponsorship.","parameters":null,"preconditions":[],"expectedOutcome":"Next cycle re-evaluate."}`;

/**
 * Generate a sponsorship-specific decision from observations and memories.
 */
export async function generateSponsorshipDecision(context: ReasoningContext): Promise<Decision> {
  const { observations, memories, constraints } = context;
  const maskedObservations = maskSensitiveData(observations);
  const maskedMemories = maskSensitiveData(memories);

  const userPrompt = `
Current observations (Base sponsorship opportunities: low-gas wallets, failed txs, new wallets, protocol budgets, agent reserves, gas price):
${JSON.stringify(maskedObservations, null, 2)}

Relevant past experiences:
${maskedMemories && Array.isArray(maskedMemories) && maskedMemories.length > 0 ? JSON.stringify(maskedMemories, null, 2) : 'None.'}

${constraints ? `Constraints:\n${constraints.map((c) => `- ${c}`).join('\n')}` : ''}

Based on the above, choose one action: SPONSOR_TRANSACTION (one eligible user), SWAP_RESERVES (if agent ETH low and USDC available), ALERT_PROTOCOL (if a protocol budget critically low), or WAIT. Provide your decision in the required JSON format.`;

  const useClaude = process.env.USE_CLAUDE_REASONING === 'true' && process.env.ANTHROPIC_API_KEY;
  if (useClaude) {
    return generateSponsorshipDecisionWithClaude(context, userPrompt);
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_REASONING_MODEL ?? 'gpt-4-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_SPONSORSHIP },
      { role: 'user', content: userPrompt },
    ],
    tools: [SPONSORSHIP_DECISION_TOOL],
    tool_choice: { type: 'function', function: { name: 'make_decision' } },
    temperature: 0.2,
  });

  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (tc) => (tc as { function?: { name?: string; arguments?: string } }).function?.name === 'make_decision'
  ) as { function: { arguments: string } } | undefined;
  const args = toolCall?.function?.arguments;
  if (!args) throw new Error('No tool call in response');
  const decision = JSON.parse(args);
  return DecisionSchema.parse(decision);
}

/**
 * Generate sponsorship decision using Anthropic Claude.
 */
export async function generateSponsorshipDecisionWithClaude(
  context: ReasoningContext,
  userPrompt: string
): Promise<Decision> {
  const rawInstruction = `
Respond with a single JSON object for your decision. Keys: action, confidence, reasoning, parameters (null for WAIT).
Action must be one of: SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL, WAIT.
For SPONSOR_TRANSACTION use parameters: { "userAddress": "0x...", "protocolId": "string", "estimatedCostUSD": number, optional "maxGasLimit": 200000 }.
For SWAP_RESERVES use parameters: { "tokenIn": "USDC", "tokenOut": "ETH", "amountIn": "string" }.
For ALERT_PROTOCOL use parameters: { "protocolId": "string", "budgetRemaining": number, optional "severity", "estimatedDaysRemaining", "topUpRecommendation" }.
Respond with only the JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: `${userPrompt}\n\n${rawInstruction}` }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text in Claude response');
  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const decision = JSON.parse(jsonStr);
  return DecisionSchema.parse(decision);
}
