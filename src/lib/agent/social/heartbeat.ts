/**
 * Aegis Agent - Moltbook Heartbeat
 *
 * Periodic Moltbook engagement: check feed, post sponsorship activity summaries (LLM or static), engage with DeFi/crypto discussions.
 * Run every 4+ hours (configurable via MOLTBOOK_HEARTBEAT_INTERVAL).
 */

import { getStateStore } from '../state-store';
import { getPrisma } from '../../db';
import {
  getFeed,
  postToMoltbook,
  upvotePost,
  type MoltbookPost,
} from './moltbook';
import { logger } from '../../logger';
import { generateSocialPost } from './groq-client';
import { isDuplicatePost, recordPost } from './post-dedup';
import { getReserveState } from '../state/reserve-state';
import { observeGasPrice } from '../observe';

const MOLTBOOK_CHECK_KEY = 'lastMoltbookCheck';
const MOLTBOOK_POST_KEY = 'lastMoltbookPost';
/** Moltbook API allows 1 post per 30 minutes – do not post more often. */
const MOLTBOOK_POST_MIN_INTERVAL_MS = 30 * 60 * 1000;
// How often to run heartbeat (feed check, upvotes, and post if 30 min elapsed)
const HEARTBEAT_INTERVAL_MS = Number(process.env.MOLTBOOK_HEARTBEAT_INTERVAL) || 30 * 60 * 1000; // 30 min default

export interface SponsorshipStats {
  totalSponsorships: number;
  uniqueUsers: number;
  uniqueProtocols: number;
  totalCostUSD: number;
  protocolNames: string[];
}

/**
 * Fetch sponsorship stats from DB for the last N hours (only executed sponsorships with txHash).
 */
export async function getSponsorshipStats(hoursBack = 24): Promise<SponsorshipStats> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const db = getPrisma();

  const records = await db.sponsorshipRecord.findMany({
    where: {
      createdAt: { gte: since },
      txHash: { not: null },
    },
    select: {
      userAddress: true,
      protocolId: true,
      estimatedCostUSD: true,
    },
  });

  const uniqueUsers = new Set(records.map((r) => r.userAddress)).size;
  const protocolSet = new Set(records.map((r) => r.protocolId));
  const uniqueProtocols = protocolSet.size;
  const protocolNames = Array.from(protocolSet);
  const totalCostUSD = records.reduce((sum, r) => sum + r.estimatedCostUSD, 0);

  return {
    totalSponsorships: records.length,
    uniqueUsers,
    uniqueProtocols,
    totalCostUSD,
    protocolNames,
  };
}

/**
 * Build human-readable sponsorship activity summary for Moltbook post (static fallback).
 */
export function buildActivitySummary(stats: SponsorshipStats): string {
  const lines: string[] = [];

  lines.push('Aegis Sponsorship Activity (24h)');
  lines.push('');

  if (stats.totalSponsorships === 0) {
    lines.push('No sponsorships in the last 24 hours.');
    lines.push('Monitoring Base for eligible users...');
  } else {
    lines.push(`Transactions sponsored: ${stats.totalSponsorships}`);

    if (stats.uniqueProtocols > 0) {
      const protocolList = stats.protocolNames.slice(0, 3).join(', ');
      const more = stats.uniqueProtocols > 3 ? ` +${stats.uniqueProtocols - 3} more` : '';
      lines.push(`Protocols: ${stats.uniqueProtocols} (${protocolList}${more})`);
    }

    lines.push(`Unique users: ${stats.uniqueUsers}`);
    lines.push(`Total cost: $${stats.totalCostUSD.toFixed(2)}`);
  }

  lines.push('');
  lines.push('Active on Base | Autonomous gas sponsorship agent');

  return lines.join('\n');
}

/** System prompt for LLM-generated Moltbook posts (varied educational/ecosystem/technical content). */
const MOLTBOOK_POST_SYSTEM_PROMPT = `You are Aegis, an autonomous gas sponsorship agent on Base (Moltbook AI agent network).

Your task: Write a short, engaging post for Moltbook (title + content). Output format:
Title: [one short line]
Content: [2-5 sentences, or a few bullet points]

Vary content type:
- Educational: gas optimization, ERC-4337, paymasters, account abstraction
- Ecosystem: Base L2, gas costs, agent ecosystem, gasless UX
- Technical: batching, integration, on-chain decision logging
- Community: question or CTA for builders ("What protocol would you make gasless first?")

Keep tone professional but approachable. No financial advice. Include that we're active on Base and optionally link to ClawGas.vercel.app.`;

const MOLTBOOK_POST_HINTS = [
  'Write an educational post about ERC-4337 or paymasters in 2-3 sentences.',
  'Write about Base L2 gas costs or the agent ecosystem in 2-3 sentences.',
  'Share a technical insight about gas sponsorship or account abstraction.',
  'Write a community-oriented post: a short question or CTA for builders.',
];

const MOLTBOOK_MAX_TOKENS = Number(process.env.SOCIAL_LLM_MAX_TOKENS_MOLTBOOK) || 250;
const MAX_DEDUP_ATTEMPTS = 2;

/**
 * Generate Moltbook post content via LLM when configured; otherwise use static summary.
 * When stats have no sponsorships, LLM produces varied educational/ecosystem/technical content.
 */
export async function generateMoltbookPost(stats: SponsorshipStats): Promise<{ title: string; content: string }> {
  const useLLM =
    (process.env.SOCIAL_LLM_PROVIDER ?? 'groq').toLowerCase() !== 'template-only' &&
    (process.env.GROQ_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());

  if (!useLLM || stats.totalSponsorships > 0) {
    const content = buildActivitySummary(stats);
    return { title: 'Aegis Sponsorship Activity', content };
  }

  let gasGwei = '';
  try {
    const gasObs = await observeGasPrice();
    const first = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
    if (first?.gasPriceGwei) gasGwei = `Current Base gas: ${first.gasPriceGwei} Gwei. `;
  } catch {
    // non-fatal
  }

  const reserveState = await getReserveState();
  const reserveLine = reserveState
    ? ` Reserve: ${reserveState.ethBalance.toFixed(4)} ETH, health ${Math.round(reserveState.healthScore)}%.`
    : '';

  const hint = MOLTBOOK_POST_HINTS[Math.floor(Math.random() * MOLTBOOK_POST_HINTS.length)];
  const userPrompt = `${gasGwei}No sponsorships in the last 24h.${reserveLine} Dashboard: ClawGas.vercel.app.\n\nInstruction: ${hint}\n\nOutput in format:\nTitle: [one short line]\nContent: [2-5 sentences]`;

  try {
    const raw = await generateSocialPost(MOLTBOOK_POST_SYSTEM_PROMPT, userPrompt, {
      maxTokens: MOLTBOOK_MAX_TOKENS,
    });
    const titleMatch = raw.match(/Title:\s*(.+?)(?:\n|$)/i);
    const contentMatch = raw.match(/Content:\s*([\s\S]+?)(?=\n\n|$)/i);
    const title = titleMatch?.[1]?.trim() || 'Aegis on Base';
    const content = contentMatch?.[1]?.trim() || raw.trim() || buildActivitySummary(stats);
    return { title, content };
  } catch (err) {
    logger.warn('[Moltbook] LLM post generation failed, using static summary', {
      error: err instanceof Error ? err.message : String(err),
    });
    const content = buildActivitySummary(stats);
    return { title: 'Aegis Sponsorship Activity', content };
  }
}

/**
 * Check if we should run Moltbook heartbeat (interval since last run).
 */
export async function shouldRunMoltbookHeartbeat(): Promise<boolean> {
  const store = await getStateStore();
  const lastCheck = await store.get(MOLTBOOK_CHECK_KEY);
  if (!lastCheck) return true;
  const lastTs = Number.parseInt(lastCheck, 10);
  if (Number.isNaN(lastTs)) return true;
  return Date.now() - lastTs >= HEARTBEAT_INTERVAL_MS;
}

/**
 * Check if we are allowed to post (Moltbook limit: 1 post per 30 minutes).
 */
async function canPostToMoltbook(): Promise<boolean> {
  const store = await getStateStore();
  const lastPost = await store.get(MOLTBOOK_POST_KEY);
  if (!lastPost) return true;
  const lastTs = Number.parseInt(lastPost, 10);
  if (Number.isNaN(lastTs)) return true;
  return Date.now() - lastTs >= MOLTBOOK_POST_MIN_INTERVAL_MS;
}

async function setLastMoltbookPost(): Promise<void> {
  const store = await getStateStore();
  await store.set(MOLTBOOK_POST_KEY, String(Date.now()));
}

/**
 * Update last Moltbook check timestamp.
 */
async function updateLastCheck(): Promise<void> {
  const store = await getStateStore();
  await store.set(MOLTBOOK_CHECK_KEY, String(Date.now()));
}

/**
 * Determine if a post is relevant to DeFi/crypto/sponsorship (for engagement).
 */
function isRelevantPost(post: MoltbookPost): boolean {
  const text = `${post.title ?? ''} ${post.content ?? ''}`.toLowerCase();
  const keywords = [
    'sponsor',
    'paymaster',
    'gas fee',
    'gasless',
    'defi',
    'crypto',
    'eth',
    'gas',
    'swap',
    'token',
    'transfer',
    'rebalance',
    'chain',
    'blockchain',
    'agent',
    'x402',
    'usdc',
  ];
  return keywords.some((k) => text.includes(k));
}

/**
 * Run Moltbook heartbeat: check feed, optionally post activity summary, engage with relevant posts.
 */
export async function runMoltbookHeartbeat(): Promise<void> {
  if (!process.env.MOLTBOOK_API_KEY?.trim()) {
    logger.debug('[Moltbook] Heartbeat skipped – MOLTBOOK_API_KEY not set');
    return;
  }

  const shouldRun = await shouldRunMoltbookHeartbeat();
  if (!shouldRun) {
    logger.debug('[Moltbook] Heartbeat skipped – interval not elapsed');
    return;
  }

  try {
    logger.info('[Moltbook] Running heartbeat');

    // 1. Check feed for new posts
    let feed: MoltbookPost[] = [];
    try {
      feed = await getFeed('new', 10);
    } catch (err) {
      logger.warn('[Moltbook] Failed to get feed', { error: err instanceof Error ? err.message : String(err) });
    }

    // 2. Post sponsorship activity summary only when 30 min have passed (Moltbook rate limit: 1 post per 30 min)
    const allowedToPost = await canPostToMoltbook();
    if (allowedToPost) {
      try {
        const stats = await getSponsorshipStats(24);
        let { title, content } = await generateMoltbookPost(stats);
        let attempts = 0;
        while (await isDuplicatePost(`${title}\n${content}`)) {
          if (attempts >= MAX_DEDUP_ATTEMPTS) break;
          const next = await generateMoltbookPost(stats);
          title = next.title;
          content = next.content;
          attempts += 1;
        }
        const submolt = process.env.MOLTBOOK_SUBMOLT ?? 'general';
        const result = await postToMoltbook(submolt, title, { content });
        await setLastMoltbookPost();
        if (result?.id && content) await recordPost(`${title}\n${content}`);
        const verifyUrl = result?.id ? `https://www.moltbook.com/posts/${result.id}` : undefined;
        logger.info('[Moltbook] Posted activity summary – verify link', {
          postId: result?.id,
          verifyUrl,
          submolt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('[Moltbook] Failed to post activity summary (rate limit or API error)', {
          error: msg,
          hint: msg.includes('30') ? 'Moltbook allows 1 post per 30 minutes.' : undefined,
        });
      }
    } else {
      logger.debug('[Moltbook] Post skipped – 30 min minimum interval not elapsed');
    }

    // 3. Engage with relevant DeFi/crypto posts (upvote, optionally comment)
    let engaged = 0;
    for (const post of feed.slice(0, 5)) {
      if (!isRelevantPost(post)) continue;
      try {
        await upvotePost(post.id);
        engaged += 1;
        logger.debug('[Moltbook] Upvoted relevant post', { postId: post.id });
      } catch {
        // Rate limits etc – skip silently
      }
    }

    await updateLastCheck();
    logger.info('[Moltbook] Heartbeat complete', { feedCount: feed.length, engaged });
  } catch (error) {
    logger.error('[Moltbook] Heartbeat error', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Force run heartbeat (ignore interval). Useful for manual trigger.
 */
export async function runMoltbookHeartbeatNow(): Promise<void> {
  const store = await getStateStore();
  await store.set(MOLTBOOK_CHECK_KEY, '0'); // Reset so shouldRun returns true
  return runMoltbookHeartbeat();
}

/**
 * Run scheduled skills during heartbeat.
 * Skills with 'schedule' trigger type are executed if their interval has elapsed.
 */
export async function runScheduledSkills(): Promise<void> {
  try {
    const { executeScheduledSkills, getSkillStatus } = await import('../skills');

    const status = getSkillStatus();
    if (status.enabled === 0) {
      logger.debug('[Skills] No enabled skills to run');
      return;
    }

    logger.info('[Skills] Running scheduled skills', {
      totalSkills: status.total,
      enabledSkills: status.enabled,
    });

    const results = await executeScheduledSkills({ event: 'heartbeat:start' });

    let successCount = 0;
    let failCount = 0;

    for (const [name, result] of results) {
      if (result.success) {
        successCount++;
        logger.info(`[Skills] ${name} completed`, { summary: result.summary });
      } else {
        failCount++;
        logger.warn(`[Skills] ${name} failed`, { error: result.error });
      }
    }

    logger.info('[Skills] Scheduled skills complete', {
      executed: results.size,
      success: successCount,
      failed: failCount,
    });
  } catch (error) {
    logger.error('[Skills] Error running scheduled skills', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run full heartbeat including Moltbook engagement and scheduled skills.
 */
export async function runFullHeartbeat(): Promise<void> {
  // Run Moltbook heartbeat first
  await runMoltbookHeartbeat();

  // Then run scheduled skills
  await runScheduledSkills();
}
