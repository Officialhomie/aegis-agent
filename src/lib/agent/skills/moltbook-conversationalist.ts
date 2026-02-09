/**
 * Aegis Agent - Moltbook Conversationalist Skill
 *
 * Replies to comments on Aegis posts and engages in relevant discussions.
 * Builds community presence and answers questions about gas sponsorship.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { getCache } from '../../cache';
import {
  getAgentPosts,
  getPostComments,
  replyToComment,
  getMoltbookProfile,
  type MoltbookComment,
  type MoltbookPost,
} from '../social/moltbook';
import { getTopDiscoveredAgents } from './agent-discovery';
import {
  MOLTBOOK_SYSTEM_PROMPT,
  isRelevantTopic,
  getAgentReferral,
} from '../personality/moltbook-persona';
import { getContextualTemperature } from '../reason/temperature-manager';
import type { Skill, SkillContext, SkillResult } from './index';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** State key for tracking replied comments */
const REPLIED_COMMENTS_KEY = 'moltbook:repliedComments';

/** Maximum comments to reply to per execution */
const MAX_REPLIES_PER_RUN = 3;

/** Minimum interval between comment replies (20 seconds per Moltbook rate limit) */
const REPLY_INTERVAL_MS = 20 * 1000;

/**
 * Check if a comment is asking a question or seeking engagement
 */
function isEngageableComment(comment: MoltbookComment, agentName: string): boolean {
  const content = comment.content.toLowerCase();

  // Skip if it's from the agent itself
  if (comment.author.name.toLowerCase() === agentName.toLowerCase()) {
    return false;
  }

  // Skip if it's a reply to another comment (we only reply to top-level)
  if (comment.parent_id) {
    return false;
  }

  // Check if it mentions Aegis or asks a question
  const mentionsAegis = content.includes('aegis') || content.includes('@aegis');
  const asksQuestion = content.includes('?');
  const mentionsTopics = isRelevantTopic(content);

  return mentionsAegis || asksQuestion || mentionsTopics;
}

/**
 * Hash comment content for cache key
 */
function hashCommentContent(content: string): string {
  return createHash('sha256').update(content.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Get agent context for richer replies
 */
async function getAgentContext(): Promise<{
  discoveredAgentsCount: number;
  recentActivity: string;
}> {
  try {
    const topAgents = await getTopDiscoveredAgents(10);
    // You'd get real activity stats from your DB here
    return {
      discoveredAgentsCount: topAgents.length,
      recentActivity: 'Active sponsorship operations on Base',
    };
  } catch {
    return {
      discoveredAgentsCount: 0,
      recentActivity: 'Active sponsorship operations on Base',
    };
  }
}

/**
 * Generate a contextual reply using LLM (Anthropic Claude)
 * with Moltbook personality and response caching
 */
async function generateReply(comment: MoltbookComment): Promise<string> {
  const topicHash = hashCommentContent(comment.content);
  const cacheKey = `moltbook:reply:${topicHash}`;

  // Try to get cached response (24h TTL)
  try {
    const cache = await getCache();
    const cached = await cache.get(cacheKey);

    if (cached != null && typeof cached === 'string') {
      logger.debug('[Conversationalist] Using cached reply', {
        topicHash,
        commentPreview: comment.content.slice(0, 50),
      });
      return cached;
    }
  } catch {
    // Cache unavailable - proceed with LLM generation
  }

  // Get agent context for richer replies
  const agentContext = await getAgentContext();

  // Check for agent referrals
  const referral = getAgentReferral(comment.content);

  // Build prompt with context
  const userPrompt = `Comment from ${comment.author.name}:
"${comment.content}"

Current context:
- Discovered agents in network: ${agentContext.discoveredAgentsCount}
- Recent activity: ${agentContext.recentActivity}
${referral ? `\nSuggested referral: ${referral}` : ''}

Generate a helpful, conversational reply that:
1. Addresses the comment directly and specifically
2. Provides technical depth where relevant
3. Includes examples or patterns if helpful
4. Stays focused and scannable (3-6 sentences max)
5. Invites follow-up questions if appropriate
${referral ? '6. Mentions the relevant agent referral naturally' : ''}

Reply:`;

  try {
    // Generate response with Moltbook personality
    const temperature = getContextualTemperature('engagement'); // 0.7

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 400,
      temperature,
      system: MOLTBOOK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text in Claude response');
    }

    const reply = textBlock.text.trim();

    // Cache the response (24h TTL)
    try {
      const cache = await getCache();
      await cache.set(cacheKey, reply, { ttlMs: 24 * 60 * 60 * 1000 }); // 24 hours
    } catch {
      // Cache unavailable - continue without caching
    }

    logger.info('[Conversationalist] Generated LLM reply', {
      topicHash,
      temperature,
      replyLength: reply.length,
      cached: false,
    });

    return reply;
  } catch (error) {
    // Fallback to simple response if LLM fails
    logger.warn('[Conversationalist] LLM generation failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });

    return `Thanks for the question! I'm an autonomous gas sponsorship agent on Base. I evaluate wallet history, protocol whitelists, and gas conditions to sponsor legitimate transactions. Happy to discuss ERC-4337, paymasters, or Base integration!`;
  }
}

/**
 * Get set of already-replied comment IDs
 */
async function getRepliedComments(): Promise<Set<string>> {
  const store = await getStateStore();
  const data = await store.get(REPLIED_COMMENTS_KEY);
  if (!data) return new Set();

  try {
    const ids = JSON.parse(data) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Mark a comment as replied
 */
async function markCommentReplied(commentId: string): Promise<void> {
  const store = await getStateStore();
  const existing = await getRepliedComments();
  existing.add(commentId);

  // Keep only last 1000 comment IDs to prevent unbounded growth
  const ids = Array.from(existing).slice(-1000);
  await store.set(REPLIED_COMMENTS_KEY, JSON.stringify(ids));
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute the Moltbook Conversationalist skill
 */
async function execute(context: SkillContext): Promise<SkillResult> {
  const dryRun = context.dryRun ?? false;

  try {
    // Get agent profile to know our name
    const profile = await getMoltbookProfile();
    const agentName = profile.name ?? 'Aegis';

    // Get recent posts by this agent
    const posts = await getAgentPosts(10);

    if (posts.length === 0) {
      return {
        success: true,
        summary: 'No agent posts found to check for comments',
        data: { postsChecked: 0, commentsFound: 0, repliesSent: 0 },
      };
    }

    const repliedComments = await getRepliedComments();
    const pendingReplies: Array<{ post: MoltbookPost; comment: MoltbookComment }> = [];

    // Collect comments that need replies
    for (const post of posts) {
      try {
        const comments = await getPostComments(post.id);

        for (const comment of comments) {
          // Skip already replied
          if (repliedComments.has(comment.id)) continue;

          // Check if engageable
          if (isEngageableComment(comment, agentName)) {
            pendingReplies.push({ post, comment });
          }
        }
      } catch (error) {
        logger.warn('[Conversationalist] Failed to get comments for post', {
          postId: post.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Reply to pending comments (up to limit)
    let repliesSent = 0;
    for (const { post, comment } of pendingReplies.slice(0, MAX_REPLIES_PER_RUN)) {
      const reply = await generateReply(comment);

      if (dryRun) {
        logger.info('[Conversationalist] [DRY RUN] Would reply to comment', {
          postId: post.id,
          commentId: comment.id,
          commentContent: comment.content.slice(0, 100),
          reply: reply.slice(0, 100),
        });
        await markCommentReplied(comment.id);
        repliesSent++;
        continue;
      }

      try {
        await replyToComment(post.id, comment.id, reply);
        await markCommentReplied(comment.id);
        repliesSent++;

        logger.info('[Conversationalist] Replied to comment', {
          postId: post.id,
          commentId: comment.id,
          reply: reply.slice(0, 100),
        });

        // Rate limit: wait 20 seconds between replies
        if (repliesSent < MAX_REPLIES_PER_RUN) {
          await sleep(REPLY_INTERVAL_MS);
        }
      } catch (error) {
        logger.warn('[Conversationalist] Failed to reply to comment', {
          postId: post.id,
          commentId: comment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: true,
      summary: `Checked ${posts.length} posts, found ${pendingReplies.length} comments, replied to ${repliesSent}`,
      data: {
        postsChecked: posts.length,
        commentsFound: pendingReplies.length,
        repliesSent,
        dryRun,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Moltbook Conversationalist Skill Definition
 */
export const moltbookConversationalistSkill: Skill = {
  name: 'moltbook-conversationalist',
  description: 'Reply to comments on Aegis posts and engage in discussions about gas sponsorship',
  trigger: 'schedule',
  interval: 30 * 60 * 1000, // Run every 30 minutes (aligned with heartbeat)
  enabled: true,
  execute,
};
