/**
 * Farcaster rate-limited posting - integration tests
 * Tests rate-limited posting, emergency bypass, token consumption.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCanPost = vi.hoisted(() => vi.fn());
const mockConsumeToken = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/social/neynar-rate-limiter', () => ({
  getNeynarRateLimiter: vi.fn().mockResolvedValue({
    canPost: mockCanPost,
    consumeToken: mockConsumeToken,
  }),
}));

vi.mock('@neynar/nodejs-sdk', () => {
  const mockPublishCast = vi.fn().mockResolvedValue({ cast: { hash: '0xcast123' } });
  return {
    NeynarAPIClient: class {
      publishCast = mockPublishCast;
    },
    Configuration: class {},
  };
});

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const mockSignedDecision = {
  decisionHash: '0xdec123',
  decision: {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Test reasoning',
    parameters: {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      estimatedCostUSD: 0.5,
    },
  },
  signature: '0xsig',
};

const mockResult = {
  success: true,
  transactionHash: '0xtx',
  sponsorshipHash: '0xtx',
  decisionHash: '0xdec123',
};

describe('Farcaster rate-limited posting', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCanPost.mockReset();
    mockConsumeToken.mockReset();
    mockCanPost.mockResolvedValue(true);
    mockConsumeToken.mockResolvedValue(undefined);
    process.env.NEYNAR_API_KEY = 'test-key';
    process.env.FARCASTER_SIGNER_UUID = 'test-signer';
  });

  it('postSponsorshipProof returns rateLimited true when canPost(proof) returns false', async () => {
    mockCanPost.mockResolvedValue(false);
    const { postSponsorshipProof } = await import(
      '../../../src/lib/agent/social/farcaster'
    );
    const result = await postSponsorshipProof(
      mockSignedDecision as any,
      mockResult as any
    );
    expect(result.rateLimited).toBe(true);
    expect(result.success).toBe(true);
    expect(mockConsumeToken).not.toHaveBeenCalled();
  });

  it('postSponsorshipProof posts successfully and calls consumeToken(proof) when allowed', async () => {
    const { postSponsorshipProof } = await import(
      '../../../src/lib/agent/social/farcaster'
    );
    const result = await postSponsorshipProof(
      mockSignedDecision as any,
      mockResult as any
    );
    expect(result.success).toBe(true);
    expect(result.rateLimited).toBeUndefined();
    expect(result.castHash).toBe('0xcast123');
    expect(mockConsumeToken).toHaveBeenCalledWith('proof');
  });

  it('postDailyStats returns rateLimited when canPost(stats) returns false', async () => {
    mockCanPost.mockResolvedValue(false);
    const { postDailyStats } = await import(
      '../../../src/lib/agent/social/farcaster'
    );
    const result = await postDailyStats({
      sponsorshipsToday: 10,
      activeProtocols: 2,
      reserveETH: 0.5,
      totalGasSavedUSD: 5,
      uniqueAgents: 3,
    });
    expect(result.rateLimited).toBe(true);
    expect(result.success).toBe(true);
    expect(mockConsumeToken).not.toHaveBeenCalled();
  });

  it('postToFarcaster with emergency category bypasses rate limit', async () => {
    mockCanPost.mockImplementation((cat: string) =>
      Promise.resolve(cat === 'emergency')
    );
    const { postToFarcaster } = await import(
      '../../../src/lib/agent/social/farcaster'
    );
    const result = await postToFarcaster('Emergency alert', 'emergency');
    expect(result.success).toBe(true);
    expect(result.rateLimited).toBeUndefined();
    expect(mockCanPost).toHaveBeenCalledWith('emergency');
    expect(mockConsumeToken).toHaveBeenCalledWith('emergency');
  });

  it('postReserveSwapProof uses health category', async () => {
    const { postReserveSwapProof } = await import(
      '../../../src/lib/agent/social/farcaster'
    );
    await postReserveSwapProof({
      tokenIn: 'USDC',
      tokenOut: 'ETH',
      amountIn: '100',
      amountOut: '0.05',
    });
    expect(mockCanPost).toHaveBeenCalledWith('health');
    expect(mockConsumeToken).toHaveBeenCalledWith('health');
  });
});
