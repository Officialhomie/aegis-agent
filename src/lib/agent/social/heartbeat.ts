/**
 * Aegis Agent - Moltbook Heartbeat
 *
 * Periodic Moltbook engagement: check feed, post sponsorship activity summaries, engage with DeFi/crypto discussions.
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
 * Build human-readable sponsorship activity summary for Moltbook post.
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
        const summary = buildActivitySummary(stats);
        const submolt = process.env.MOLTBOOK_SUBMOLT ?? 'general';
        const result = await postToMoltbook(submolt, 'Aegis Sponsorship Activity', { content: summary });
        await setLastMoltbookPost();
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
