/**
 * Protocol Deposit-Verify API Tests
 *
 * Tests for POST and GET /api/protocol/[protocolId]/deposit-verify
 * Covers auth, validation, success, and error cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockProtocol, createMockDeposit, mockEnv } from '../../utils/test-helpers';

const mockVerifyApiAuth = vi.fn();
vi.mock('@/src/lib/auth/api-auth', () => ({
  verifyApiAuth: (req: Request) => mockVerifyApiAuth(req),
}));

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

const mockVerifyAndCreditDeposit = vi.fn();
const mockGetProtocolDeposits = vi.fn();
vi.mock('@/src/lib/agent/observe/usdc-deposits', () => ({
  verifyAndCreditDeposit: (protocolId: string, txHash: unknown) =>
    mockVerifyAndCreditDeposit(protocolId, txHash),
  getProtocolDeposits: (protocolId: string) => mockGetProtocolDeposits(protocolId),
}));

vi.mock('@/src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('POST /api/protocol/[protocolId]/deposit-verify', () => {
  const protocolId = 'test-protocol';
  const validTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyApiAuth.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when auth fails (no Bearer token)', async () => {
    mockVerifyApiAuth.mockReturnValue({ valid: false, error: 'Missing Bearer token' });
    const { POST } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'POST',
      body: { txHash: validTxHash },
    });

    const res = await POST(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
    expect(json.message).toContain('Bearer');
  });

  it('returns 400 when txHash format is invalid', async () => {
    const { POST } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'POST',
      body: { txHash: 'bad' },
    });

    const res = await POST(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when deposit verification fails', async () => {
    mockVerifyAndCreditDeposit.mockResolvedValue({
      success: false,
      error: 'Transaction not found or not a USDC transfer',
    });
    const { POST } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'POST',
      body: { txHash: validTxHash },
    });

    const res = await POST(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Deposit verification failed');
    expect(json.message).toBeDefined();
  });

  it('returns 200 with success, amount, newBalance on success', async () => {
    mockVerifyAndCreditDeposit.mockResolvedValue({
      success: true,
      amount: 100,
      newBalance: 300,
    });
    const { POST } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'POST',
      body: { txHash: validTxHash },
    });

    const res = await POST(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.protocolId).toBe(protocolId);
    expect(json.txHash).toBe(validTxHash);
    expect(json.amount).toBe(100);
    expect(json.newBalance).toBe(300);
  });

  it('returns 500 when verifyAndCreditDeposit throws', async () => {
    mockVerifyAndCreditDeposit.mockRejectedValue(new Error('Database connection failed'));
    const { POST } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'POST',
      body: { txHash: validTxHash },
    });

    const res = await POST(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});

describe('GET /api/protocol/[protocolId]/deposit-verify', () => {
  const protocolId = 'test-protocol';

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyApiAuth.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyApiAuth.mockReturnValue({ valid: false, error: 'Invalid API key' });
    const { GET } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'GET',
    });

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with deposits array on success', async () => {
    const mockDeposits = [
      createMockDeposit({ protocolId, txHash: '0xabc', amount: 50 }),
      createMockDeposit({ protocolId, txHash: '0xdef', amount: 75 }),
    ];
    mockGetProtocolDeposits.mockResolvedValue(mockDeposits);
    const { GET } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'GET',
    });

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.protocolId).toBe(protocolId);
    expect(Array.isArray(json.deposits)).toBe(true);
    expect(json.deposits.length).toBe(2);
    expect(json.total).toBe(50 + 75);
  });

  it('returns 500 when getProtocolDeposits throws', async () => {
    mockGetProtocolDeposits.mockRejectedValue(new Error('DB error'));
    const { GET } = await import('../../../app/api/protocol/[protocolId]/deposit-verify/route');

    const req = createMockRequest(`http://localhost/api/protocol/${protocolId}/deposit-verify`, {
      method: 'GET',
    });

    const res = await GET(req, { params: Promise.resolve({ protocolId }) });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch deposits');
  });
});
