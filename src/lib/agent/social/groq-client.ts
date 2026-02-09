/**
 * Social post generation: Groq (primary, free tier) + Anthropic Claude (fallback).
 * Conservative token limits to preserve quota.
 */

import { logger } from '../../logger';

const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_TEMPERATURE = 0.85;
const DEFAULT_MAX_TOKENS_FARCASTER = 150;

export interface GenerateSocialPostOptions {
  /** Max tokens for response (Farcaster ~150, Moltbook ~250) */
  maxTokens?: number;
  /** Temperature for creativity (default 0.85) */
  temperature?: number;
}

/**
 * Generate a short social post using Groq (primary) or Claude (fallback).
 * Trims and returns plain text only; no markdown or extra formatting.
 */
export async function generateSocialPost(
  systemPrompt: string,
  userPrompt: string,
  options: GenerateSocialPostOptions = {}
): Promise<string> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS_FARCASTER;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  const provider = (process.env.SOCIAL_LLM_PROVIDER ?? 'groq').toLowerCase();
  const useGroqFirst = provider === 'groq' && process.env.GROQ_API_KEY?.trim();

  if (useGroqFirst) {
    try {
      const text = await generateWithGroq(systemPrompt, userPrompt, { maxTokens, temperature });
      if (text?.trim()) {
        logger.debug('[SocialLLM] Generated with Groq', { length: text.length });
        return trimPost(text);
      }
    } catch (err) {
      logger.warn('[SocialLLM] Groq failed, falling back to Claude', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    const text = await generateWithClaude(systemPrompt, userPrompt, { maxTokens, temperature });
    if (text?.trim()) {
      logger.debug('[SocialLLM] Generated with Claude', { length: text.length });
      return trimPost(text);
    }
  } catch (err) {
    logger.warn('[SocialLLM] Claude fallback failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  throw new Error('Social post generation failed (Groq and Claude unavailable)');
}

async function generateWithGroq(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens: number; temperature: number }
): Promise<string> {
  const Groq = (await import('groq-sdk')).default;
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  });

  const content = completion.choices[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens: number; temperature: number }
): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514',
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = response.content.find((b) => b.type === 'text');
  const text = block && block.type === 'text' ? block.text : '';
  return text;
}

/** Trim to single block, strip excess newlines and leading/trailing whitespace */
function trimPost(text: string): string {
  let out = text.trim();
  if (out.includes('\n\n\n')) {
    out = out.split('\n\n\n')[0].trim();
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
