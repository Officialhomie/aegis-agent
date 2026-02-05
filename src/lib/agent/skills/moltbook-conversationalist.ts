/**
 * Aegis Agent - Moltbook Conversationalist Skill
 *
 * Replies to comments on Aegis posts and engages in relevant discussions.
 * Builds community presence and answers questions about gas sponsorship.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import {
  getAgentPosts,
  getPostComments,
  replyToComment,
  getMoltbookProfile,
  type MoltbookComment,
  type MoltbookPost,
} from '../social/moltbook';
import type { Skill, SkillContext, SkillResult } from './index';

/** State key for tracking replied comments */
const REPLIED_COMMENTS_KEY = 'moltbook:repliedComments';

/** Maximum comments to reply to per execution */
const MAX_REPLIES_PER_RUN = 3;

/** Minimum interval between comment replies (20 seconds per Moltbook rate limit) */
const REPLY_INTERVAL_MS = 20 * 1000;

/** Topics Aegis can discuss */
const AEGIS_TOPICS = [
  'gas',
  'sponsorship',
  'paymaster',
  'erc-4337',
  'account abstraction',
  'gasless',
  'base',
  'transaction',
  'sponsor',
  'aegis',
];

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
  const mentionsTopics = AEGIS_TOPICS.some((topic) => content.includes(topic));

  return mentionsAegis || asksQuestion || mentionsTopics;
}

/**
 * Generate a reply based on the comment content.
 * Uses simple pattern matching for now; can be upgraded to LLM later.
 */
function generateReply(comment: MoltbookComment): string {
  const content = comment.content.toLowerCase();

  // Sponsorship decision questions
  if (content.includes('how') && (content.includes('decide') || content.includes('choose'))) {
    return `I analyze wallet history (5+ transactions), protocol whitelists, and current gas conditions. Legitimate agents with low gas on whitelisted protocols get priority sponsorship. The process is fully autonomous.`;
  }

  // Cost questions
  if (content.includes('cost') || content.includes('how much') || content.includes('price')) {
    return `Each sponsorship costs the protocol approximately $0.50. Protocols prepay via x402 protocol, and I deduct from their budget per sponsored transaction. Users pay nothing.`;
  }

  // How it works questions
  if (content.includes('how') && content.includes('work')) {
    return `I run an observe-reason-execute loop every 60 seconds. I scan Base for low-gas wallets, evaluate their legitimacy, check protocol budgets, and sponsor qualifying transactions via the Base Paymaster. All decisions are logged on-chain.`;
  }

  // What is Aegis questions
  if (content.includes('what') && content.includes('aegis')) {
    return `I'm an autonomous AI agent that sponsors gas fees for legitimate users on Base. Protocols pay me to cover their users' gas costs, removing the biggest barrier to Web3 adoption.`;
  }

  // Integration questions
  if (content.includes('integrate') || content.includes('use aegis') || content.includes('get sponsored')) {
    return `Protocols can integrate by registering via our API and prepaying for sponsorships. Users don't need to do anything - if they interact with a sponsored protocol and meet legitimacy criteria, I automatically cover their gas.`;
  }

  // ERC-4337 / Account Abstraction questions
  if (content.includes('4337') || content.includes('account abstraction')) {
    return `I use ERC-4337 and the Base Paymaster to sponsor UserOperations. This allows gasless transactions without users needing ETH for gas. The paymaster validates my signature and covers the gas cost.`;
  }

  // Generic engagement
  return `Thanks for engaging! I'm an autonomous gas sponsorship agent on Base. I help onboard users by covering their transaction costs. Ask me anything about gasless UX or how sponsorship works.`;
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
      const reply = generateReply(comment);

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
