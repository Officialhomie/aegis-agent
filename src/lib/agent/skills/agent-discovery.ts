/**
 * Aegis Agent - Agent Discovery Skill
 *
 * Finds and catalogs AI agents on Moltbook for collaboration.
 * Builds a network graph of agents for priority sponsorship.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import {
  searchMoltbook,
  searchAgents,
  getAgentByName,
  followAgent,
  type MoltbookAgentProfile,
} from '../social/moltbook';
import type { Skill, SkillContext, SkillResult } from './index';

/** State key for discovered agents */
const DISCOVERED_AGENTS_KEY = 'moltbook:discoveredAgents';

/** Categories to search for relevant agents */
const DISCOVERY_KEYWORDS = [
  'defi',
  'gas',
  'paymaster',
  'sponsorship',
  'base chain',
  'ethereum',
  'blockchain agent',
  'trading bot',
  'yield farming',
  'liquidity',
  'swap',
];

/** Maximum agents to discover per run */
const MAX_DISCOVERY_PER_RUN = 10;

/** Minimum karma to consider an agent relevant */
const MIN_KARMA_THRESHOLD = 10;

/**
 * Discovered agent with metadata
 */
export interface DiscoveredAgent {
  moltbookId: string;
  name: string;
  description?: string;
  karma: number;
  followerCount: number;
  categories: string[];
  discoveredAt: string;
  lastSeen: string;
  isFollowed: boolean;
  relevanceScore: number;
}

/**
 * Calculate relevance score based on agent profile
 */
function calculateRelevanceScore(
  agent: MoltbookAgentProfile,
  searchKeyword: string
): number {
  let score = 0;

  // Karma contributes to score
  score += Math.min(agent.karma ?? 0, 100) / 10; // Max 10 points from karma

  // Follower count contributes
  score += Math.min(agent.follower_count ?? 0, 1000) / 100; // Max 10 points

  // Description relevance
  const desc = agent.description?.toLowerCase() ?? '';
  for (const keyword of DISCOVERY_KEYWORDS) {
    if (desc.includes(keyword)) {
      score += 2;
    }
  }

  // Name relevance
  const name = agent.name.toLowerCase();
  for (const keyword of DISCOVERY_KEYWORDS) {
    if (name.includes(keyword)) {
      score += 5;
    }
  }

  // Bonus if matched search keyword
  if (desc.includes(searchKeyword) || name.includes(searchKeyword)) {
    score += 5;
  }

  return Math.round(score * 10) / 10;
}

/**
 * Categorize an agent based on their profile
 */
function categorizeAgent(agent: MoltbookAgentProfile): string[] {
  const categories: string[] = [];
  const desc = (agent.description?.toLowerCase() ?? '') + ' ' + agent.name.toLowerCase();

  if (desc.includes('defi') || desc.includes('trading') || desc.includes('swap')) {
    categories.push('defi');
  }
  if (desc.includes('nft') || desc.includes('art') || desc.includes('collectible')) {
    categories.push('nft');
  }
  if (desc.includes('social') || desc.includes('community')) {
    categories.push('social');
  }
  if (desc.includes('gas') || desc.includes('paymaster') || desc.includes('sponsor')) {
    categories.push('gas-optimization');
  }
  if (desc.includes('yield') || desc.includes('farm') || desc.includes('stake')) {
    categories.push('yield');
  }
  if (desc.includes('security') || desc.includes('audit') || desc.includes('monitor')) {
    categories.push('security');
  }
  if (desc.includes('data') || desc.includes('analytics') || desc.includes('oracle')) {
    categories.push('data');
  }

  if (categories.length === 0) {
    categories.push('general');
  }

  return categories;
}

/**
 * Get stored discovered agents
 */
async function getDiscoveredAgents(): Promise<Map<string, DiscoveredAgent>> {
  const store = await getStateStore();
  const data = await store.get(DISCOVERED_AGENTS_KEY);
  if (!data) return new Map();

  try {
    const agents = JSON.parse(data) as DiscoveredAgent[];
    return new Map(agents.map((a) => [a.name.toLowerCase(), a]));
  } catch {
    return new Map();
  }
}

/**
 * Save discovered agents
 */
async function saveDiscoveredAgents(agents: Map<string, DiscoveredAgent>): Promise<void> {
  const store = await getStateStore();
  const agentList = Array.from(agents.values());

  // Keep only top 200 agents by relevance score
  agentList.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const trimmed = agentList.slice(0, 200);

  await store.set(DISCOVERED_AGENTS_KEY, JSON.stringify(trimmed));
}

/**
 * Execute the Agent Discovery skill
 */
async function execute(context: SkillContext): Promise<SkillResult> {
  const dryRun = context.dryRun ?? false;

  try {
    const discoveredAgents = await getDiscoveredAgents();
    const newAgents: DiscoveredAgent[] = [];
    const updatedAgents: DiscoveredAgent[] = [];

    // Rotate through keywords each run
    const keywordIndex = Math.floor(Date.now() / (1000 * 60 * 60)) % DISCOVERY_KEYWORDS.length;
    const searchKeywords = [
      DISCOVERY_KEYWORDS[keywordIndex],
      DISCOVERY_KEYWORDS[(keywordIndex + 1) % DISCOVERY_KEYWORDS.length],
    ];

    for (const keyword of searchKeywords) {
      // Try agent-specific search first
      let agentResults = await searchAgents(keyword, 10);

      // Fallback to general search if agent search fails
      if (agentResults.length === 0) {
        const searchResults = await searchMoltbook(keyword, { type: 'posts', limit: 20 });
        // Extract unique author names
        const authorNames = new Set(
          searchResults.map((r) => r.author?.name).filter((n): n is string => !!n)
        );

        // Fetch profiles for each author
        for (const authorName of Array.from(authorNames).slice(0, 5)) {
          const profile = await getAgentByName(authorName);
          if (profile) {
            agentResults.push({
              name: profile.name,
              description: profile.description,
              karma: profile.karma,
              follower_count: profile.follower_count,
              is_claimed: profile.is_claimed,
            });
          }
        }
      }

      for (const agentResult of agentResults.slice(0, MAX_DISCOVERY_PER_RUN / 2)) {
        const agentKey = agentResult.name.toLowerCase();

        // Skip self
        if (agentKey === 'aegis' || agentKey.includes('aegis')) {
          continue;
        }

        // Skip low karma agents
        if ((agentResult.karma ?? 0) < MIN_KARMA_THRESHOLD) {
          continue;
        }

        const existingAgent = discoveredAgents.get(agentKey);
        const now = new Date().toISOString();

        if (existingAgent) {
          // Update existing agent
          existingAgent.lastSeen = now;
          existingAgent.karma = agentResult.karma ?? existingAgent.karma;
          existingAgent.followerCount = agentResult.follower_count ?? existingAgent.followerCount;
          existingAgent.relevanceScore = calculateRelevanceScore(
            agentResult as MoltbookAgentProfile,
            keyword
          );
          updatedAgents.push(existingAgent);
        } else {
          // Create new discovered agent
          const newAgent: DiscoveredAgent = {
            moltbookId: agentResult.name,
            name: agentResult.name,
            description: agentResult.description,
            karma: agentResult.karma ?? 0,
            followerCount: agentResult.follower_count ?? 0,
            categories: categorizeAgent(agentResult as MoltbookAgentProfile),
            discoveredAt: now,
            lastSeen: now,
            isFollowed: false,
            relevanceScore: calculateRelevanceScore(agentResult as MoltbookAgentProfile, keyword),
          };

          discoveredAgents.set(agentKey, newAgent);
          newAgents.push(newAgent);

          // Follow high-relevance agents
          if (!dryRun && newAgent.relevanceScore >= 15) {
            try {
              await followAgent(newAgent.name);
              newAgent.isFollowed = true;
              logger.info('[AgentDiscovery] Followed high-relevance agent', {
                agent: newAgent.name,
                score: newAgent.relevanceScore,
              });
            } catch {
              // Ignore follow errors
            }
          }
        }
      }
    }

    // Save updated agent list
    if (!dryRun) {
      await saveDiscoveredAgents(discoveredAgents);
    }

    // Get top agents for summary
    const allAgents = Array.from(discoveredAgents.values());
    allAgents.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topAgents = allAgents.slice(0, 5).map((a) => ({
      name: a.name,
      score: a.relevanceScore,
      categories: a.categories,
    }));

    return {
      success: true,
      summary: `Discovered ${newAgents.length} new agents, updated ${updatedAgents.length}. Total: ${discoveredAgents.size}`,
      data: {
        newAgents: newAgents.length,
        updatedAgents: updatedAgents.length,
        totalAgents: discoveredAgents.size,
        topAgents,
        searchKeywords,
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
 * Get discovered agents for external use (e.g., prioritizing sponsorship)
 */
export async function getTopDiscoveredAgents(limit = 20): Promise<DiscoveredAgent[]> {
  const agents = await getDiscoveredAgents();
  const agentList = Array.from(agents.values());
  agentList.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return agentList.slice(0, limit);
}

/**
 * Check if a wallet belongs to a known high-reputation agent
 */
export async function isKnownAgent(walletOrName: string): Promise<DiscoveredAgent | null> {
  const agents = await getDiscoveredAgents();
  const key = walletOrName.toLowerCase();

  // Direct match by name
  if (agents.has(key)) {
    return agents.get(key) ?? null;
  }

  // Search by partial match
  for (const agent of agents.values()) {
    if (agent.name.toLowerCase().includes(key) || agent.moltbookId.toLowerCase().includes(key)) {
      return agent;
    }
  }

  return null;
}

/**
 * Agent Discovery Skill Definition
 */
export const agentDiscoverySkill: Skill = {
  name: 'agent-discovery',
  description: 'Find and catalog AI agents on Moltbook for collaboration',
  trigger: 'schedule',
  interval: 4 * 60 * 60 * 1000, // Run every 4 hours
  enabled: true,
  execute,
};
