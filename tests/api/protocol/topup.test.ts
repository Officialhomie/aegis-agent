/**
 * Protocol Top-up API Tests
 *
 * Tests for POST /api/protocol/[protocolId]/topup
 * Covers on-chain USDC verification and legacy flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockProtocol, createMockDeposit, mockEnv } from '../../utils/test-helpers';

// Mock Prisma
const mockPrisma = {
  protocolSponsor: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  depositTransaction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@/src/lib/db', () => ({
  getPrisma: () => mockPrisma,
}));

// Mock USDC deposit verification and GET deposit list
const mockVerifyAndCreditDeposit = vi.fn();
const mockGetProtocolDeposits = vi.fn();
vi.mock('@/src/lib/agent/observe/usdc-deposits', () => ({
  verifyAndCreditDeposit: (protocolId: string, txHash: string) =>
    mockVerifyAndCreditDeposit(protocolId, txHash),
  getProtocolDeposits: (protocolId: string) => mockGetProtocolDeposits(protocolId),
}));

// Mock logger
vi.mock('@/src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('POST /api/protocol/[protocolId]/topup', () => {
  const protocolId = 'test-protocol';
  const validTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('On-chain verification flow', () => {
    it('successfully verifies and credits USDC deposit', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      const mockProtocol = createMockProtocol({ protocolId, balanceUSD: 200 });

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(mockProtocol);
      mockVerifyAndCreditDeposit.mockResolvedValue({
        success: true,
        amount: 100,
        newBalance: 300,
      });

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: {
          txHash: validTxHash,
          chainId: 8453,
        },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.protocolId).toBe(protocolId);
      expect(json.txHash).toBe(validTxHash);
      expect(json.amount).toBe(100);
      expect(json.newBalance).toBe(300);
      expect(json.verifiedAt).toBeDefined();
    });

    it('returns 400 when deposit verification fails', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());
      mockVerifyAndCreditDeposit.mockResolvedValue({
        verified: false,
        error: 'Transaction not found or not a USDC transfer',
      });

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: { txHash: validTxHash },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Deposit verification failed');
      expect(json.details).toContain('not a USDC transfer');
    });

    it('returns 404 for non-existent protocol', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: { txHash: validTxHash },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Protocol not found');
    });

    it('returns 400 for invalid txHash format', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: { txHash: 'invalid-hash' },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid request');
    });

    it('uses default chainId when not provided', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());
      mockVerifyAndCreditDeposit.mockResolvedValue({
        success: true,
        amount: 50,
        newBalance: 150,
      });

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: { txHash: validTxHash }, // No chainId
      });

      await POST(req, { params: Promise.resolve({ protocolId }) });

      // API calls verifyAndCreditDeposit(protocolId, txHash) only
      expect(mockVerifyAndCreditDeposit).toHaveBeenCalledWith(protocolId, validTxHash);
    });
  });

  describe('Legacy flow (deprecated)', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockEnv({ ALLOW_LEGACY_TOPUP: 'true' });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('allows legacy topup when ALLOW_LEGACY_TOPUP=true', async () => {
      // Need to re-import to pick up env change
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      const mockProtocol = createMockProtocol({ balanceUSD: 150 });
      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(mockProtocol);
      mockPrisma.protocolSponsor.update.mockResolvedValue({
        ...mockProtocol,
        balanceUSD: 200,
      });

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: {
          amountUSD: 50,
          reference: 'legacy-test',
        },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.warning).toContain('deprecated');
      expect(json.topupAmount).toBe(50);
    });
  });

  describe('Error handling', () => {
    it('returns 400 for empty body', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: {},
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid request');
      expect(json.required).toBeDefined();
    });

    it('handles verification service errors gracefully', async () => {
      const { POST } = await import('../../../app/api/protocol/[protocolId]/topup/route');

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());
      mockVerifyAndCreditDeposit.mockRejectedValue(new Error('RPC error'));

      const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        body: { txHash: validTxHash },
      });

      const res = await POST(req, { params: Promise.resolve({ protocolId }) });
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toContain('RPC error');
    });
  });
});

describe('GET /api/protocol/[protocolId]/topup', () => {
  const protocolId = 'test-protocol';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deposit history for protocol', async () => {
    const { GET } = await import('../../../app/api/protocol/[protocolId]/topup/route');

    const mockProtocol = createMockProtocol({ balanceUSD: 500 });
    const mockDeposits = [
      createMockDeposit({ amount: 100 }),
      createMockDeposit({ amount: 200, txHash: '0xabc' + '0'.repeat(61) }),
    ];

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(mockProtocol);
    mockGetProtocolDeposits.mockResolvedValue(mockDeposits);

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
      method: 'GET',
    });

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.protocolId).toBe(protocolId);
    expect(json.currentBalance).toBe(500);
    expect(json.deposits).toHaveLength(2);
    expect(json.depositCount).toBe(2);
  });

  it('returns specific deposit when txHash query param provided', async () => {
    const { GET } = await import('../../../app/api/protocol/[protocolId]/topup/route');

    const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const mockProtocol = createMockProtocol();
    const mockDeposit = createMockDeposit({ txHash, amount: 150 });

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(mockProtocol);
    mockGetProtocolDeposits.mockResolvedValue([mockDeposit]);

    const req = createMockRequest(
      `http://localhost/api/protocol/${protocolId}/topup?txHash=${txHash}`,
      { method: 'GET' }
    );

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.protocolId).toBe(protocolId);
    expect(json.deposit.txHash).toBe(txHash);
    expect(json.deposit.amount).toBe(150);
  });

  it('returns 404 for non-existent protocol', async () => {
    const { GET } = await import('../../../app/api/protocol/[protocolId]/topup/route');

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/topup`, {
      method: 'GET',
    });

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent deposit txHash', async () => {
    const { GET } = await import('../../../app/api/protocol/[protocolId]/topup/route');

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());
    mockGetProtocolDeposits.mockResolvedValue([]);

    const txHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const req = createMockRequest(
      `http://localhost/api/protocol/${protocolId}/topup?txHash=${txHash}`,
      { method: 'GET' }
    );

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe('Deposit not found');
  });
});
