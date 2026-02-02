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
