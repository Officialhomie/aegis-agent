/**
 * Aegis Skills - LLM evaluation for skill execution.
 * Builds prompt from skill content + context; returns structured result (parse with SkillResultSchema).
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { SkillResultSchema, type SkillResultZod } from './schemas';
import type { Skill } from './types';
import type { SkillContext } from './types';
import { logger } from '../logger';

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY required for skills LLM');
  return new OpenAI({ apiKey: key });
}
function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY required for skills LLM (anthropic provider)');
  return new Anthropic({ apiKey: key });
}

const SKILL_OUTPUT_INSTRUCTION = `
Respond with a single JSON object only. No markdown, no explanation outside the JSON.
Keys (all required except warnings):
- decision: one of "APPROVE", "REJECT", "ESCALATE"
- confidence: number 0-100
- reasoning: string (brief)
- warnings: optional array of strings

Example: {"decision":"APPROVE","confidence":85,"reasoning":"Gas and cost within limits.","warnings":[]}`;

function buildPrompt(skill: Skill, context: SkillContext): string {
  const ctxJson = JSON.stringify(
    {
      agentWallet: context.agentWallet,
      protocolId: context.protocolId,
      estimatedCostUSD: context.estimatedCostUSD,
      currentGasPrice: context.currentGasPrice != null ? context.currentGasPrice.toString() : undefined,
      chainId: context.chainId,
      passportTier: (context.passport as { tier?: string } | undefined)?.tier,
    },
    null,
    2
  );
  return `## Skill: ${skill.metadata.name}\n${skill.metadata.description}\n\n## Guidelines (from skill)\n${skill.content.slice(0, 6000)}\n\n## Current context (JSON)\n${ctxJson}\n\n## Your task\nApply the skill guidelines to the context. Output your verdict as JSON.\n${SKILL_OUTPUT_INSTRUCTION}`;
}

function parseJsonFromResponse(raw: string): SkillResultZod {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as unknown;
  return SkillResultSchema.parse(parsed);
}

/**
 * Call LLM for skill evaluation; returns parsed result or throws.
 */
export async function evaluateSkillWithLLM(
  skill: Skill,
  context: SkillContext
): Promise<SkillResultZod> {
  const modelSpec = (process.env.SKILLS_LLM_MODEL ?? 'openai:gpt-4o-mini').trim();
  const [provider, model] = modelSpec.includes(':') ? modelSpec.split(':', 2) : ['openai', modelSpec];
  const prompt = buildPrompt(skill, context);

  if (provider.toLowerCase() === 'anthropic') {
    const response = await getAnthropic().messages.create({
      model: model || (process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514'),
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in Claude response');
    return parseJsonFromResponse(textBlock.text);
  }

  const response = await getOpenAI().chat.completions.create({
    model: model || (process.env.OPENAI_REASONING_MODEL ?? 'gpt-4o-mini'),
    messages: [
      { role: 'system', content: 'You output only valid JSON. No markdown code fences.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Empty OpenAI response');
  return parseJsonFromResponse(text);
}

export function isSkillsLlmAvailable(): boolean {
  const spec = process.env.SKILLS_LLM_MODEL ?? '';
  const provider = spec.includes(':') ? spec.split(':', 1)[0]?.toLowerCase() : 'openai';
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY);
}
