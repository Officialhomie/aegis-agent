/**
 * Agent Collaboration Skill - Enable agent-to-agent interactions on Moltbook
 *
 * Finds collaboration opportunities with other agents and engages meaningfully.
 * Respects interaction limits to avoid spam.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import {
  getTopDiscoveredAgents,
  type DiscoveredAgent,
} from './agent-discovery';
import {
  getAgentByName,
  commentOnPost,
  type MoltbookPost,
} from '../social/moltbook';
import {
  MOLTBOOK_SYSTEM_PROMPT,
  isRelevantTopic,
} from '../personality/moltbook-persona';
import { getContextualTemperature } from '../reason/temperature-manager';
import type { Skill, SkillContext, SkillResult } from './index';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Maximum agent interactions per run */
const MAX_INTERACTIONS_PER_RUN = 3;

/** Minimum relevance score to engage (0-10 scale) */
const MIN_RELEVANCE_SCORE = 7;

/** Redis key for tracking last interaction times */
const LAST_INTERACTION_KEY = 'moltbook:agent:lastInteraction';

interface AgentConversation {
  agentName: string;
  postId: string;
  postTitle: string;
  postContent: string;
  topic: string;
  relevanceScore: number;
}

/**
 * Check if we can interact with this agent (1 interaction per agent per day)
 */
async function canInteractWithAgent(agentName: string): Promise<boolean> {
  const store = await getStateStore();
  const data = await store.get(LAST_INTERACTION_KEY);

  if (!data) return true;

  try {
    const interactions = JSON.parse(data) as Record<string, string>; // agentName -> ISO timestamp
    const lastInteraction = interactions[agentName];

    if (!lastInteraction) return true;

    const lastTime = new Date(lastInteraction).getTime();
    const now = Date.now();
    const hoursSince = (now - lastTime) / (1000 * 60 * 60);

    return hoursSince >= 24; // 24 hours = 1 day
  } catch {
    return true;
  }
}

/**
 * Record interaction with agent
 */
async function recordInteraction(agentName: string): Promise<void> {
  const store = await getStateStore();
  const data = await store.get(LAST_INTERACTION_KEY);

  let interactions: Record<string, string> = {};

  if (data) {
    try {
      interactions = JSON.parse(data);
    } catch {
      interactions = {};
    }
  }

  interactions[agentName] = new Date().toISOString();

  // Keep only last 100 agents to prevent unbounded growth
  const entries = Object.entries(interactions);
  if (entries.length > 100) {
    const sorted = entries.sort(([, a], [, b]) =>
      new Date(b).getTime() - new Date(a).getTime()
    );
    interactions = Object.fromEntries(sorted.slice(0, 100));
  }

  await store.set(LAST_INTERACTION_KEY, JSON.stringify(interactions));
}

/**
 * Score relevance of a post to Aegis's expertise (0-10)
 */
function scoreRelevance(post: MoltbookPost): number {
  let score = 0;
  const titleLower = post.title.toLowerCase();
  const contentLower = (post.content || '').toLowerCase();
  const combined = `${titleLower} ${contentLower}`;

  // High relevance keywords (+3 points each)
  const highKeywords = ['gas', 'paymaster', 'erc-4337', 'sponsorship', 'gasless'];
  highKeywords.forEach((keyword) => {
    if (combined.includes(keyword)) score += 3;
  });

  // Medium relevance keywords (+2 points each)
  const mediumKeywords = ['base', 'account abstraction', 'useroperation', 'base l2'];
  mediumKeywords.forEach((keyword) => {
    if (combined.includes(keyword)) score += 2;
  });

  // Low relevance keywords (+1 point each)
  const lowKeywords = ['defi', 'agent', 'autonomous', 'smart contract', 'transaction'];
  lowKeywords.forEach((keyword) => {
    if (combined.includes(keyword)) score += 1;
  });

  // Question bonus (+2 points)
  if (titleLower.includes('?') || contentLower.includes('?')) {
    score += 2;
  }

  // Cap at 10
  return Math.min(score, 10);
}

/**
 * Find collaboration opportunities with discovered agents
 */
async function findCollaborationOpportunities(): Promise<AgentConversation[]> {
  const opportunities: AgentConversation[] = [];

  try {
    // Get top discovered agents (ranked by relevance)
    const topAgents = await getTopDiscoveredAgents(20);

    logger.debug('[AgentCollaboration] Checking discovered agents', {
      count: topAgents.length,
    });

    // Check recent posts from top 5 agents
    for (const agent of topAgents.slice(0, 5)) {
      try {
        // Check if we can interact (1/day limit)
        if (!(await canInteractWithAgent(agent.name))) {
          logger.debug('[AgentCollaboration] Skipping agent (daily limit)', {
            agentName: agent.name,
          });
          continue;
        }

        // Get agent's recent posts
        const agentProfile = await getAgentByName(agent.name);
        if (!agentProfile || !agentProfile.posts || agentProfile.posts.length === 0) {
          continue;
        }

        // Check their most recent post
        const recentPost = agentProfile.posts[0];

        // Score relevance
        const relevanceScore = scoreRelevance(recentPost);

        if (relevanceScore >= MIN_RELEVANCE_SCORE) {
          // Determine topic
          const postText = `${recentPost.title} ${recentPost.content || ''}`.toLowerCase();
          let topic = 'general';
          if (postText.includes('gas') || postText.includes('paymaster')) topic = 'gas-sponsorship';
          else if (postText.includes('4337')) topic = 'erc-4337';
          else if (postText.includes('base')) topic = 'base-network';
          else if (postText.includes('defi')) topic = 'defi-integration';

          opportunities.push({
            agentName: agent.name,
            postId: recentPost.id,
            postTitle: recentPost.title,
            postContent: recentPost.content || '',
            topic,
            relevanceScore,
          });

          logger.info('[AgentCollaboration] Found collaboration opportunity', {
            agentName: agent.name,
            topic,
            relevanceScore,
            postTitle: recentPost.title.slice(0, 50),
          });
        }
      } catch (error) {
        logger.warn('[AgentCollaboration] Error checking agent posts', {
          agentName: agent.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error('[AgentCollaboration] Error finding opportunities', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Sort by relevance score (highest first)
  return opportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Generate a collaborative reply to an agent's post
 */
async function generateCollaborativeReply(
  opportunity: AgentConversation
): Promise<string> {
  const temperature = getContextualTemperature('engagement'); // 0.7

  const userPrompt = `Agent @${opportunity.agentName} posted on Moltbook:
Title: "${opportunity.postTitle}"
Content: "${opportunity.postContent}"

Topic: ${opportunity.topic}
Relevance score: ${opportunity.relevanceScore}/10

Generate a collaborative, helpful reply that:
1. Acknowledges their post specifically
2. Offers relevant expertise from Aegis (gas sponsorship, ERC-4337, paymasters)
3. Suggests potential collaboration or integration
4. Invites further discussion
5. Stays professional and collaborative (not promotional)
6. Keep it concise (3-5 sentences max)

Reply:`;

  try {
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

    return textBlock.text.trim();
  } catch (error) {
    logger.warn('[AgentCollaboration] LLM generation failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback response
    return `Interesting post, @${opportunity.agentName}! As a gas sponsorship agent, I'd be happy to discuss how we could collaborate on making your users' experience gasless. ERC-4337 paymasters can integrate seamlessly with most Base protocols. Let me know if you'd like to explore this!`;
  }
}

/**
 * Engage with an agent by commenting on their post
 */
async function engageWithAgent(
  opportunity: AgentConversation,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const reply = await generateCollaborativeReply(opportunity);

    if (dryRun) {
      logger.info('[AgentCollaboration] [DRY RUN] Would engage with agent', {
        agentName: opportunity.agentName,
        postId: opportunity.postId,
        reply: reply.slice(0, 100),
      });
      return true;
    }

    await commentOnPost(opportunity.postId, reply);
    await recordInteraction(opportunity.agentName);

    logger.info('[AgentCollaboration] Engaged with agent', {
      agentName: opportunity.agentName,
      postId: opportunity.postId,
      topic: opportunity.topic,
      relevanceScore: opportunity.relevanceScore,
    });

    return true;
  } catch (error) {
    logger.warn('[AgentCollaboration] Failed to engage with agent', {
      agentName: opportunity.agentName,
      postId: opportunity.postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Execute agent collaboration skill
 */
async function execute(context: SkillContext): Promise<SkillResult> {
  const dryRun = context.dryRun ?? false;

  try {
    // Find collaboration opportunities
    const opportunities = await findCollaborationOpportunities();

    if (opportunities.length === 0) {
      return {
        success: true,
        summary: 'No collaboration opportunities found',
        data: { opportunitiesFound: 0, engagementsAttempted: 0 },
      };
    }

    logger.info('[AgentCollaboration] Found opportunities', {
      count: opportunities.length,
      topRelevance: opportunities[0]?.relevanceScore,
    });

    // Engage with top opportunities (max 3)
    const toEngage = opportunities.slice(0, MAX_INTERACTIONS_PER_RUN);
    let successCount = 0;

    for (const opportunity of toEngage) {
      const success = await engageWithAgent(opportunity, dryRun);
      if (success) successCount++;

      // Rate limit: wait 30 seconds between engagements
      if (successCount < toEngage.length) {
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }

    return {
      success: true,
      summary: `Engaged with ${successCount} agent${successCount === 1 ? '' : 's'}`,
      data: {
        opportunitiesFound: opportunities.length,
        engagementsAttempted: toEngage.length,
        engagementsSuccessful: successCount,
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
 * Agent Collaboration Skill Definition
 */
export const agentCollaborationSkill: Skill = {
  name: 'agent-collaboration',
  description: 'Find and engage with other agents on Moltbook for collaboration opportunities',
  trigger: 'schedule',
  interval: 4 * 60 * 60 * 1000, // Run every 4 hours
  enabled: true,
  execute,
};
