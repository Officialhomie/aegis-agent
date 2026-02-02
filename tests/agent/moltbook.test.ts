/**
 * Moltbook integration tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;

const mockPaymentCount = vi.fn().mockResolvedValue(0);
const mockReputationFindMany = vi.fn().mockResolvedValue([]);
const mockReputationCount = vi.fn().mockResolvedValue(0);

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: unknown) {
    return {
      paymentRecord: { count: mockPaymentCount },
      reputationAttestation: {
        findMany: mockReputationFindMany,
        count: mockReputationCount,
      },
    };
  }),
}));

vi.mock('../../src/lib/agent', () => ({
  runAgentCycle: vi.fn().mockResolvedValue({ executionResult: { success: false } }),
}));

vi.mock('../../src/lib/agent/social/moltbook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/agent/social/moltbook')>();
  return {
    ...actual,
    getMoltbookProfile: vi.fn().mockRejectedValue(new Error('MOLTBOOK_API_KEY not configured')),
  };
});

describe('registerMoltbookAgent', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns api_key and claim_url on success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agent: {
          api_key: 'moltbook_abc123',
          claim_url: 'https://www.moltbook.com/claim/moltbook_claim_xyz',
          verification_code: 'reef-X4B2',
        },
        important: 'SAVE YOUR API KEY!',
      }),
    });
    const { registerMoltbookAgent } = await import('../../src/lib/agent/social/moltbook');
    const result = await registerMoltbookAgent('Aegis', 'Treasury agent');
    expect(result.agent.api_key).toBe('moltbook_abc123');
    expect(result.agent.claim_url).toContain('moltbook.com/claim/');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('www.moltbook.com/api/v1/agents/register'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Aegis', description: 'Treasury agent' }),
      })
    );
  });

  it('throws when registration fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Name taken' }) });
    const { registerMoltbookAgent } = await import('../../src/lib/agent/social/moltbook');
    await expect(registerMoltbookAgent('Taken', 'desc')).rejects.toThrow();
  });
});

describe('getMoltbookStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MOLTBOOK_API_KEY = 'moltbook_test_key';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns pending_claim when not yet claimed', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'pending_claim' }),
    });
    const { getMoltbookStatus } = await import('../../src/lib/agent/social/moltbook');
    const status = await getMoltbookStatus();
    expect(status.status).toBe('pending_claim');
  });

  it('throws when MOLTBOOK_API_KEY not set', async () => {
    delete process.env.MOLTBOOK_API_KEY;
    const { getMoltbookStatus } = await import('../../src/lib/agent/social/moltbook');
    await expect(getMoltbookStatus()).rejects.toThrow('MOLTBOOK_API_KEY not configured');
  });
});

describe('postToMoltbook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MOLTBOOK_API_KEY = 'moltbook_test_key';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('posts with submolt, title, content', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'post-123', success: true }),
    });
    const { postToMoltbook } = await import('../../src/lib/agent/social/moltbook');
    const result = await postToMoltbook('general', 'Hello', { content: 'My first post' });
    expect(result.id).toBe('post-123');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/posts'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer moltbook_test_key' }),
        body: JSON.stringify({ submolt: 'general', title: 'Hello', content: 'My first post' }),
      })
    );
  });
});

describe('parseX402Headers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no x402 header', async () => {
    const { parseX402Headers } = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', { headers: {} });
    expect(parseX402Headers(req)).toBeNull();
  });

  it('parses X-PAYWITH-402 JSON header', async () => {
    const proof = {
      paymentHash: '0xabc',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    const { parseX402Headers } = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', {
      headers: { 'X-PAYWITH-402': JSON.stringify(proof) },
    });
    const result = parseX402Headers(req);
    expect(result).toEqual(proof);
  });

  it('parses Base64-encoded proof', async () => {
    const proof = { paymentHash: '0x', amount: '50', currency: 'ETH', chainId: 1 };
    const b64 = Buffer.from(JSON.stringify(proof)).toString('base64');
    const { parseX402Headers } = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', { headers: { 'PAYMENT-SIGNATURE': b64 } });
    const result = parseX402Headers(req);
    expect(result).toEqual(proof);
  });

  it('returns null for invalid JSON', async () => {
    const { parseX402Headers } = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', {
      headers: { 'X-PAYWITH-402': 'not-valid-json' },
    });
    expect(parseX402Headers(req)).toBeNull();
  });
});

describe('requirePayment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv, X402_FACILITATOR_URL: 'https://facilitator.test/verify' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns verified: false when no header', async () => {
    const mod = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', { headers: {} });
    const result = await mod.requirePayment(req);
    expect(result.verified).toBe(false);
    expect(result.error).toContain('Missing or invalid');
  });

  it('returns verified: true when facilitator verifies', async () => {
    const proof = { paymentHash: '0x', amount: '100', currency: 'USDC', chainId: 84532 };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: true,
        payment: {
          paymentHash: '0x',
          amount: BigInt(100),
          currency: 'USDC',
          chainId: 84532,
          requestedAction: 'run',
          requester: '0x123',
        },
      }),
    });
    const mod = await import('../../src/lib/agent/payments/x402-middleware');
    const req = new Request('https://example.com', {
      headers: { 'X-PAYWITH-402': JSON.stringify(proof) },
    });
    const result = await mod.requirePayment(req);
    expect(result.verified).toBe(true);
    expect(result.payment?.currency).toBe('USDC');
  });
});

describe('getUnifiedReputation', () => {
  it('returns structure with onChain, payments, combined', async () => {
    const { getUnifiedReputation } = await import('../../src/lib/agent/identity/unified-reputation');
    const result = await getUnifiedReputation('agent-1');
    expect(result).toHaveProperty('onChain');
    expect(result).toHaveProperty('payments');
    expect(result).toHaveProperty('combined');
    expect(result.moltbook).toBeNull();
    expect(result.onChain).toEqual({ averageScore: 0, count: 0 });
    expect(result.payments).toEqual({
      successRate: 0,
      total: 0,
      executed: 0,
      pending: 0,
    });
    expect(result.combined).toBe(0);
  });
});
