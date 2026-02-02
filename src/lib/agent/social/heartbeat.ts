/**
 * Aegis Agent - Moltbook Heartbeat
 *
 * Periodic Moltbook engagement: check feed, post treasury insights, engage with DeFi/crypto discussions.
 * Run every 4+ hours (configurable via MOLTBOOK_HEARTBEAT_INTERVAL).
 */

import { getStateStore } from '../state-store';
import { observe } from '../observe';
import {
  getFeed,
  postToMoltbook,
  upvotePost,
  type MoltbookPost,
} from './moltbook';
import { logger } from '../../logger';

const MOLTBOOK_CHECK_KEY = 'lastMoltbookCheck';
const HEARTBEAT_INTERVAL_MS = Number(process.env.MOLTBOOK_HEARTBEAT_INTERVAL) || 4 * 60 * 60 * 1000; // 4 hours

/**
 * Check if we should run Moltbook heartbeat (4+ hours since last check).
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
 * Update last Moltbook check timestamp.
 */
async function updateLastCheck(): Promise<void> {
  const store = await getStateStore();
  await store.set(MOLTBOOK_CHECK_KEY, String(Date.now()));
}

/**
 * Build treasury insight text from observations.
 */
function buildTreasuryInsight(observations: Awaited<ReturnType<typeof observe>>): string {
  const lines: string[] = [];
  for (const obs of observations) {
    const d = obs.data as Record<string, unknown>;
    if (d.gasPriceGwei != null) {
      lines.push(`Gas: ${d.gasPriceGwei} Gwei (chain ${obs.chainId ?? '?'})`);
    }
    if (d.pair === 'ETH/USD' && d.price != null) {
      lines.push(`ETH/USD: $${d.price}`);
    }
    if (d.tokens && Array.isArray(d.tokens)) {
      const tokens = d.tokens as Array<{ symbol?: string; balanceFormatted?: string }>;
      const tokenLines = tokens
        .slice(0, 5)
        .map((t) => `${t.symbol ?? '?'}: ${t.balanceFormatted ?? '0'}`)
        .join(', ');
      if (tokenLines) lines.push(`Portfolio: ${tokenLines}`);
    }
  }
  if (lines.length === 0) return 'Treasury observation update – no new data.';
  return `Aegis treasury update:\n\n${lines.join('\n')}\n\n(autonomous agent, observe-reason-execute loop)`;
}

/**
 * Determine if a post is relevant to DeFi/crypto/treasury (for engagement).
 */
function isRelevantPost(post: MoltbookPost): boolean {
  const text = `${post.title ?? ''} ${post.content ?? ''}`.toLowerCase();
  const keywords = [
    'treasury',
    'defi',
    'crypto',
    'eth',
    'gas',
    'swap',
    'token',
    'transfer',
    'rebalance',
    'portfolio',
    'chain',
    'blockchain',
    'agent',
    'x402',
    'usdc',
  ];
  return keywords.some((k) => text.includes(k));
}

/**
 * Run Moltbook heartbeat: check feed, optionally post insights, engage with relevant posts.
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

    // 2. Optionally post treasury insights (1-2x/day, based on interval)
    const postInsights = HEARTBEAT_INTERVAL_MS >= 4 * 60 * 60 * 1000; // at least 4h interval
    if (postInsights) {
      try {
        const observations = await observe();
        const insight = buildTreasuryInsight(observations);
        const submolt = process.env.MOLTBOOK_SUBMOLT ?? 'general';
        await postToMoltbook(submolt, 'Aegis Treasury Update', { content: insight });
        logger.info('[Moltbook] Posted treasury insight');
      } catch (err) {
        logger.warn('[Moltbook] Failed to post insight', { error: err instanceof Error ? err.message : String(err) });
      }
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
