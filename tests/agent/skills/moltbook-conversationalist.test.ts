/**
 * Moltbook Conversationalist Skill - unit tests
 * Tests LLM generation, caching, fallback, referrals, rate limit, replied tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockMessagesCreate = vi.hoisted(() => vi.fn());
const mockStoreGet = vi.hoisted(() => vi.fn());
const mockStoreSet = vi.hoisted(() => vi.fn());
const mockCacheGet = vi.hoisted(() => vi.fn());
const mockCacheSet = vi.hoisted(() => vi.fn());
const mockGetAgentPosts = vi.hoisted(() => vi.fn());
const mockGetPostComments = vi.hoisted(() => vi.fn());
const mockReplyToComment = vi.hoisted(() => vi.fn());
const mockGetMoltbookProfile = vi.hoisted(() => vi.fn());
const mockGetTopDiscoveredAgents = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    get messages() {
      return { create: mockMessagesCreate };
    }
  },
}));

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockStoreGet,
    set: mockStoreSet,
    setNX: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/cache', () => ({
  getCache: vi.fn().mockReturnValue({
    get: mockCacheGet,
    set: mockCacheSet,
  }),
}));

vi.mock('../../../src/lib/agent/social/moltbook', () => ({
  getAgentPosts: mockGetAgentPosts,
  getPostComments: mockGetPostComments,
  replyToComment: mockReplyToComment,
  getMoltbookProfile: mockGetMoltbookProfile,
}));

vi.mock('../../../src/lib/agent/skills/agent-discovery', () => ({
  getTopDiscoveredAgents: mockGetTopDiscoveredAgents,
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { MOLTBOOK_SYSTEM_PROMPT } from '../../../src/lib/agent/personality/moltbook-persona';

function makeComment(
  id: string,
  content: string,
  authorName: string,
  parentId?: string
): import('../../../src/lib/agent/social/moltbook').MoltbookComment {
  return {
    id,
    content,
    author: { name: authorName },
    created_at: new Date().toISOString(),
    parent_id: parentId,
  };
}

function makePost(id: string): import('../../../src/lib/agent/social/moltbook').MoltbookPost {
  return { id, submolt: 'test', title: 'Test', content: '' };
}

describe('moltbook-conversationalist', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockMessagesCreate.mockReset();
    mockStoreGet.mockReset();
    mockStoreSet.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockGetAgentPosts.mockReset();
    mockGetPostComments.mockReset();
    mockReplyToComment.mockReset();
    mockGetMoltbookProfile.mockReset();
    mockGetTopDiscoveredAgents.mockReset();

    mockGetMoltbookProfile.mockResolvedValue({ name: 'Aegis' });
    mockGetAgentPosts.mockResolvedValue([makePost('p1')]);
    mockGetTopDiscoveredAgents.mockResolvedValue([]);
    mockStoreGet.mockResolvedValue(null);
    mockStoreSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockReplyToComment.mockImplementation(
      async (_p: string, _c: string, content: unknown) => {
        await Promise.resolve(content);
        return { id: 'reply-1' };
      }
    );
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'LLM reply' }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls anthropic.messages.create with temperature 0.7 and MOLTBOOK_SYSTEM_PROMPT on cache miss', async () => {
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'How does account abstraction work?', 'User1'),
    ]);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );
    await moltbookConversationalistSkill.execute({ dryRun: false });

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        system: MOLTBOOK_SYSTEM_PROMPT,
      })
    );
  });

  it('returns cached reply on second call with same content (no LLM call)', async () => {
    const sameContent = 'What is ERC-4337?';
    mockGetPostComments
      .mockResolvedValueOnce([makeComment('c1', sameContent, 'User1')])
      .mockResolvedValueOnce([makeComment('c2', sameContent, 'User2')]);

    mockStoreGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(['c1']));

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );

    await moltbookConversationalistSkill.execute({ dryRun: false });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    mockCacheGet.mockResolvedValue('LLM reply');

    await moltbookConversationalistSkill.execute({ dryRun: false });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('returns fallback containing "autonomous gas sponsorship agent" when Anthropic throws', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('API error'));
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'How does paymaster work?', 'User1'),
    ]);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );
    const result = await moltbookConversationalistSkill.execute({ dryRun: false });

    expect(result.success).toBe(true);
    const replyArg = mockReplyToComment.mock.calls[0]?.[2];
    const reply = typeof replyArg?.then === 'function' ? await replyArg : replyArg;
    expect(String(reply)).toContain('autonomous gas sponsorship agent');
  });

  it('includes referral in prompt when comment mentions yield farming', async () => {
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'How does yield farming work with gas sponsorship?', 'User1'),
    ]);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );
    await moltbookConversationalistSkill.execute({ dryRun: false });

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const options = (mockMessagesCreate.mock.calls[0] as any)[0];
    const userContent = options.messages[0].content;
    expect(userContent).toContain('@YieldMaximizer');
  });

  it('skips own comments and nested replies; engages on questions and Aegis mentions', async () => {
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'What do you think?', 'Aegis'),
      makeComment('c2', 'Reply to someone', 'User2', 'parent-id'),
      makeComment('c3', 'How does gas sponsorship work?', 'User3'),
      makeComment('c4', 'Hey @aegis, can you help?', 'User4'),
    ]);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );
    const result = await moltbookConversationalistSkill.execute({ dryRun: false });

    expect(result.success).toBe(true);
    const data = result.data as { commentsFound: number; repliesSent: number };
    expect(data.commentsFound).toBe(2);
    expect(data.repliesSent).toBeLessThanOrEqual(3);
  });

  it('respects MAX_REPLIES_PER_RUN (3) with 5 engageable comments', async () => {
    vi.useFakeTimers();
    const comments = Array.from({ length: 5 }, (_, i) =>
      makeComment(`c${i}`, `Question ${i}?`, `User${i}`)
    );
    mockGetPostComments.mockResolvedValue(comments);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );
    const runPromise = moltbookConversationalistSkill.execute({ dryRun: false });
    await vi.advanceTimersByTimeAsync(25_000);
    const result = await runPromise;

    expect(result.success).toBe(true);
    const data = result.data as { repliesSent: number };
    expect(data.repliesSent).toBe(3);
  });

  it('stores replied comment ID in state and skips on next run', async () => {
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'First question?', 'User1'),
    ]);

    const { moltbookConversationalistSkill } = await import(
      '../../../src/lib/agent/skills/moltbook-conversationalist'
    );

    await moltbookConversationalistSkill.execute({ dryRun: false });
    expect(mockStoreSet).toHaveBeenCalled();
    const setCall = mockStoreSet.mock.calls.find(
      (c: any) => c[0] === 'moltbook:repliedComments'
    );
    expect(setCall).toBeDefined();
    const stored = JSON.parse(setCall[1]);
    expect(stored).toContain('c1');

    const replyCountAfterFirstRun = mockReplyToComment.mock.calls.length;
    mockStoreGet.mockResolvedValue(JSON.stringify(['c1']));
    mockGetPostComments.mockResolvedValue([
      makeComment('c1', 'First question?', 'User1'),
    ]);
    await moltbookConversationalistSkill.execute({ dryRun: false });
    expect(mockReplyToComment.mock.calls.length).toBe(replyCountAfterFirstRun);
  });
});
