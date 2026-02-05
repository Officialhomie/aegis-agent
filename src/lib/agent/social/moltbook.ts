/**
 * Aegis Agent - Moltbook Integration
 *
 * Moltbook API client for AI agent social network.
 * CRITICAL: Always use https://www.moltbook.com (with www) - otherwise redirect strips Authorization header.
 */

import { logger } from '../../logger';

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';
const REQUEST_TIMEOUT_MS = 15000;

function getApiKey(): string {
  const key = process.env.MOLTBOOK_API_KEY;
  if (!key?.trim()) {
    throw new Error('MOLTBOOK_API_KEY not configured. Register first via scripts/register-moltbook.ts');
  }
  return key;
}

async function moltbookFetch<T>(
  path: string,
  options: RequestInit & { apiKey?: string } = {}
): Promise<T> {
  const { apiKey, ...fetchOpts } = options as RequestInit & { apiKey?: string };
  const key = apiKey ?? getApiKey();
  const url = `${MOLTBOOK_BASE}${path}`;

  const res = await fetch(url, {
    ...fetchOpts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...fetchOpts.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; hint?: string };

  if (!res.ok) {
    const errMsg = data.error ?? `HTTP ${res.status}`;
    const hint = data.hint ? ` Hint: ${data.hint}` : '';
    throw new Error(`Moltbook API error: ${errMsg}${hint}`);
  }

  return data as T;
}

export interface MoltbookRegistrationResult {
  agent: {
    api_key: string;
    claim_url: string;
    verification_code: string;
  };
  important: string;
}

export interface MoltbookStatus {
  status: 'pending_claim' | 'claimed';
}

export interface MoltbookPost {
  id: string;
  submolt: string;
  title: string;
  content?: string;
  url?: string;
  author?: { name: string };
  upvotes?: number;
  created_at?: string;
}

export interface MoltbookAgentProfile {
  name: string;
  description?: string;
  karma?: number;
  follower_count?: number;
  is_claimed?: boolean;
  owner?: { x_handle?: string; x_name?: string };
}

export interface MoltbookFeedResponse {
  success?: boolean;
  posts?: MoltbookPost[];
  data?: MoltbookPost[];
}

export interface MoltbookSearchResult {
  id: string;
  type: 'post' | 'comment';
  title?: string | null;
  content: string;
  similarity?: number;
  author?: { name: string };
  submolt?: { name: string; display_name: string };
  post_id?: string;
}

export interface MoltbookSearchResponse {
  success: boolean;
  query: string;
  type: string;
  results: MoltbookSearchResult[];
  count: number;
}

/**
 * Register a new agent on Moltbook.
 * Does NOT require API key - returns one.
 * Human must visit claim_url and tweet to verify.
 */
export async function registerMoltbookAgent(
  name: string,
  description: string
): Promise<MoltbookRegistrationResult> {
  const url = `${MOLTBOOK_BASE}/agents/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await res.json().catch(() => ({}))) as MoltbookRegistrationResult & { error?: string };

  if (!res.ok) {
    throw new Error(`Moltbook registration failed: ${data.error ?? res.status}`);
  }

  if (!data.agent?.api_key || !data.agent?.claim_url) {
    throw new Error('Invalid registration response: missing api_key or claim_url');
  }

  logger.info('[Moltbook] Registration successful', { agentName: name, claimUrl: data.agent.claim_url });
  return data;
}

/**
 * Get claim status (pending_claim vs claimed).
 */
export async function getMoltbookStatus(apiKey?: string): Promise<MoltbookStatus> {
  const key = apiKey ?? getApiKey();
  return moltbookFetch<MoltbookStatus>('/agents/status', { apiKey: key });
}

/**
 * Get own profile.
 */
export async function getMoltbookProfile(apiKey?: string): Promise<MoltbookAgentProfile> {
  const key = apiKey ?? getApiKey();
  const data = await moltbookFetch<{ agent?: MoltbookAgentProfile }>('/agents/me', { apiKey: key });
  return (data as { agent: MoltbookAgentProfile }).agent ?? (data as unknown as MoltbookAgentProfile);
}

/**
 * Update agent profile (name, description). Undocumented endpoint – may not exist.
 * Returns updated profile on success; throws on 404 or other API error.
 */
export async function updateMoltbookProfile(
  updates: { name?: string; description?: string },
  apiKey?: string
): Promise<MoltbookAgentProfile> {
  const key = apiKey ?? getApiKey();
  const data = await moltbookFetch<{ agent?: MoltbookAgentProfile }>('/agents/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
    apiKey: key,
  });
  return (data as { agent: MoltbookAgentProfile }).agent ?? (data as unknown as MoltbookAgentProfile);
}

/**
 * Create a post.
 * Rate limit: 1 post per 30 minutes.
 */
export async function postToMoltbook(
  submolt: string,
  title: string,
  options?: { content?: string; url?: string }
): Promise<{ id: string; success?: boolean }> {
  const body = { submolt, title, ...options };
  return moltbookFetch<{ id: string; success?: boolean }>('/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Add a comment to a post.
 * Rate limit: 1 comment per 20 seconds, 50 per day.
 */
export async function commentOnPost(
  postId: string,
  content: string,
  parentId?: string
): Promise<{ id: string; success?: boolean }> {
  const body = parentId ? { content, parent_id: parentId } : { content };
  return moltbookFetch<{ id: string; success?: boolean }>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upvote a post.
 */
export async function upvotePost(postId: string): Promise<{ success?: boolean }> {
  return moltbookFetch<{ success?: boolean }>(`/posts/${postId}/upvote`, { method: 'POST' });
}

/**
 * Downvote a post.
 */
export async function downvotePost(postId: string): Promise<{ success?: boolean }> {
  return moltbookFetch<{ success?: boolean }>(`/posts/${postId}/downvote`, { method: 'POST' });
}

/**
 * Get personalized feed (subscribed submolts + followed agents).
 * Sort: hot | new | top
 */
export async function getFeed(
  sort: 'hot' | 'new' | 'top' = 'hot',
  limit = 25
): Promise<MoltbookPost[]> {
  const data = await moltbookFetch<MoltbookFeedResponse>(`/feed?sort=${sort}&limit=${limit}`);
  return data.posts ?? data.data ?? [];
}

/**
 * Get global posts (all submolts).
 */
export async function getPosts(
  sort: 'hot' | 'new' | 'top' | 'rising' = 'hot',
  limit = 25,
  submolt?: string
): Promise<MoltbookPost[]> {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (submolt) params.set('submolt', submolt);
  const data = await moltbookFetch<MoltbookFeedResponse>(`/posts?${params}`);
  return data.posts ?? data.data ?? [];
}

/**
 * Semantic search - natural language query.
 */
export async function searchMoltbook(
  query: string,
  options?: { type?: 'posts' | 'comments' | 'all'; limit?: number }
): Promise<MoltbookSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options?.type) params.set('type', options.type);
  if (options?.limit) params.set('limit', String(options.limit));
  const data = await moltbookFetch<MoltbookSearchResponse>(`/search?${params}`);
  return data.results ?? [];
}

/**
 * Get identity token for "Sign in with Moltbook" (use when calling other agents' APIs).
 * Requires Moltbook developer app key - different from agent API key.
 */
export async function getMoltbookIdentityToken(apiKey?: string): Promise<string> {
  const key = apiKey ?? getApiKey();
  const data = await moltbookFetch<{ token?: string }>('/agents/me/identity-token', {
    method: 'POST',
    apiKey: key,
  });
  const token = (data as { token?: string }).token;
  if (!token) throw new Error('Moltbook identity token not returned');
  return token;
}

/**
 * Create a submolt (community).
 */
export async function createSubmolt(
  name: string,
  displayName: string,
  description?: string
): Promise<{ name: string; success?: boolean }> {
  return moltbookFetch<{ name: string; success?: boolean }>('/submolts', {
    method: 'POST',
    body: JSON.stringify({ name, display_name: displayName, description }),
  });
}

/**
 * Subscribe to a submolt.
 */
export async function subscribeToSubmolt(submoltName: string): Promise<{ success?: boolean }> {
  return moltbookFetch<{ success?: boolean }>(`/submolts/${submoltName}/subscribe`, {
    method: 'POST',
  });
}

// ============================================================================
// Conversationalist Skill API Functions
// ============================================================================

/**
 * Comment on a Moltbook post
 */
export interface MoltbookComment {
  id: string;
  content: string;
  author: {
    name: string;
    id?: string;
    is_agent?: boolean;
  };
  created_at: string;
  parent_id?: string;
  upvotes?: number;
  replies?: MoltbookComment[];
}

interface MoltbookCommentsResponse {
  success?: boolean;
  comments?: MoltbookComment[];
  data?: MoltbookComment[];
}

/**
 * Get comments on a specific post.
 */
export async function getPostComments(postId: string): Promise<MoltbookComment[]> {
  const data = await moltbookFetch<MoltbookCommentsResponse>(`/posts/${postId}/comments`);
  return data.comments ?? data.data ?? [];
}

/**
 * Reply to a specific comment on a post.
 * This is a convenience wrapper around commentOnPost with parentId.
 */
export async function replyToComment(
  postId: string,
  parentCommentId: string,
  content: string
): Promise<{ id: string; success?: boolean }> {
  return commentOnPost(postId, content, parentCommentId);
}

/**
 * Mention interface for agent notifications
 */
export interface MoltbookMention {
  id: string;
  type: 'post' | 'comment';
  post_id: string;
  comment_id?: string;
  content: string;
  author: {
    name: string;
    id?: string;
  };
  created_at: string;
  read?: boolean;
}

interface MoltbookMentionsResponse {
  success?: boolean;
  mentions?: MoltbookMention[];
  data?: MoltbookMention[];
}

/**
 * Get mentions of the agent (posts/comments that mention this agent).
 * Note: This endpoint may not exist - falls back to search if needed.
 */
export async function getAgentMentions(): Promise<MoltbookMention[]> {
  try {
    const data = await moltbookFetch<MoltbookMentionsResponse>('/agents/me/mentions');
    return data.mentions ?? data.data ?? [];
  } catch (error) {
    // Fallback: search for agent name mentions
    const profile = await getMoltbookProfile();
    if (!profile.name) return [];

    const searchResults = await searchMoltbook(`@${profile.name}`, { type: 'all', limit: 20 });
    return searchResults.map((r) => ({
      id: r.id,
      type: r.type,
      post_id: r.post_id ?? r.id,
      comment_id: r.type === 'comment' ? r.id : undefined,
      content: r.content,
      author: r.author ?? { name: 'unknown' },
      created_at: new Date().toISOString(),
      read: false,
    }));
  }
}

/**
 * Get posts created by this agent.
 */
export async function getAgentPosts(limit = 10): Promise<MoltbookPost[]> {
  try {
    const profile = await getMoltbookProfile();
    if (!profile.name) return [];

    // Try to get agent's own posts via profile endpoint
    const data = await moltbookFetch<MoltbookFeedResponse>(`/agents/${profile.name}/posts?limit=${limit}`);
    return data.posts ?? data.data ?? [];
  } catch {
    // Fallback: search for posts by this agent
    const profile = await getMoltbookProfile();
    if (!profile.name) return [];

    const searchResults = await searchMoltbook(`author:${profile.name}`, { type: 'posts', limit });
    return searchResults.map((r) => ({
      id: r.id,
      submolt: r.submolt?.name ?? 'general',
      title: r.title ?? '',
      content: r.content,
      author: r.author,
    }));
  }
}

/**
 * Get a single post by ID with full details.
 */
export async function getPost(postId: string): Promise<MoltbookPost | null> {
  try {
    const data = await moltbookFetch<{ post?: MoltbookPost; data?: MoltbookPost }>(`/posts/${postId}`);
    return data.post ?? data.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Search for agents on Moltbook.
 */
export interface MoltbookAgentSearchResult {
  name: string;
  description?: string;
  karma?: number;
  follower_count?: number;
  is_claimed?: boolean;
}

interface MoltbookAgentSearchResponse {
  success?: boolean;
  agents?: MoltbookAgentSearchResult[];
  data?: MoltbookAgentSearchResult[];
  count?: number;
}

/**
 * Search for agents by keyword.
 */
export async function searchAgents(query: string, limit = 20): Promise<MoltbookAgentSearchResult[]> {
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const data = await moltbookFetch<MoltbookAgentSearchResponse>(`/agents/search?${params}`);
    return data.agents ?? data.data ?? [];
  } catch {
    // Fallback: general search and filter for agent-related results
    logger.warn('[Moltbook] Agent search endpoint not available, using general search');
    return [];
  }
}

/**
 * Get agent profile by name.
 */
export async function getAgentByName(agentName: string): Promise<MoltbookAgentProfile | null> {
  try {
    const data = await moltbookFetch<{ agent?: MoltbookAgentProfile }>(`/agents/${agentName}`);
    return data.agent ?? null;
  } catch {
    return null;
  }
}

/**
 * Follow an agent.
 */
export async function followAgent(agentName: string): Promise<{ success?: boolean }> {
  return moltbookFetch<{ success?: boolean }>(`/agents/${agentName}/follow`, { method: 'POST' });
}

/**
 * Unfollow an agent.
 */
export async function unfollowAgent(agentName: string): Promise<{ success?: boolean }> {
  return moltbookFetch<{ success?: boolean }>(`/agents/${agentName}/unfollow`, { method: 'POST' });
}
