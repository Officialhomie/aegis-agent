/**
 * x402 payment verification and execution tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { X402PaymentProof, VerifiedPayment } from '../../src/lib/agent/payments/x402';

const mockFindUnique = vi.fn().mockResolvedValue(null);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockCreate = vi.fn().mockResolvedValue({ id: 'created-1' });

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: unknown) {
    return {
      paymentRecord: {
        findUnique: mockFindUnique,
        update: mockUpdate,
        create: mockCreate,
      },
    };
  }),
}));

vi.mock('../../src/lib/agent/index', () => ({
  runAgentCycle: vi.fn().mockResolvedValue({ executionResult: { success: false } }),
}));

vi.mock('../../src/lib/agent/identity/reputation', () => ({
  recordExecution: vi.fn().mockResolvedValue('att-1'),
}));

const verifiedPayment: VerifiedPayment = {
  paymentHash: '0xabc123',
  amount: BigInt(100),
  currency: 'USDC',
  chainId: 84532,
  requestedAction: 'run_cycle',
  requester: '0xrequester',
};

describe('verifyX402Payment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv, X402_FACILITATOR_URL: 'https://facilitator.test/verify' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('throws when payment proof has missing required fields', async () => {
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    await expect(verifyX402Payment({ paymentHash: '', amount: '100', currency: 'USDC', chainId: 1 })).rejects.toThrow(
      'Invalid payment proof: missing required fields'
    );
    await expect(verifyX402Payment({ paymentHash: '0x', amount: '', currency: 'USDC', chainId: 1 })).rejects.toThrow(
      'Invalid payment proof: missing required fields'
    );
    await expect(verifyX402Payment({ paymentHash: '0x', amount: '100', currency: '', chainId: 1 })).rejects.toThrow(
      'Invalid payment proof: missing required fields'
    );
  });

  it('throws when X402_FACILITATOR_URL is not set', async () => {
    delete process.env.X402_FACILITATOR_URL;
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    const proof: X402PaymentProof = {
      paymentHash: '0xhash',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    await expect(verifyX402Payment(proof)).rejects.toThrow('X402_FACILITATOR_URL not configured');
  });

  it('throws when facilitator returns non-ok status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    const proof: X402PaymentProof = {
      paymentHash: '0xhash',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    await expect(verifyX402Payment(proof)).rejects.toThrow('Payment verification failed: 500');
  });

  it('throws when facilitator returns verified: false', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: false }),
    });
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    const proof: X402PaymentProof = {
      paymentHash: '0xhash',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    await expect(verifyX402Payment(proof)).rejects.toThrow('Payment verification rejected by facilitator');
  });

  it('returns payment when facilitator verifies successfully', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        verified: true,
        payment: {
          ...verifiedPayment,
          amount: verifiedPayment.amount.toString(),
        },
      }),
    });
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    const proof: X402PaymentProof = {
      paymentHash: '0xhash',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    const result = await verifyX402Payment(proof);
    expect(result.paymentHash).toBe(verifiedPayment.paymentHash);
    expect(Number(result.amount)).toBe(Number(verifiedPayment.amount));
    expect(result.currency).toBe(verifiedPayment.currency);
    expect(result.chainId).toBe(verifiedPayment.chainId);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/verify'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('sends Authorization header when X402_API_KEY is set', async () => {
    process.env.X402_API_KEY = 'test-key';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: true, payment: { ...verifiedPayment, amount: '100' } }),
    });
    const { verifyX402Payment } = await import('../../src/lib/agent/payments/x402');
    await verifyX402Payment({
      paymentHash: '0x',
      amount: '100',
      currency: 'USDC',
      chainId: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      })
    );
  });
});

describe('executePaidAction idempotency', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, X402_FACILITATOR_URL: 'https://facilitator.test' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns idempotent result when payment already EXECUTED in DB', async () => {
    mockFindUnique.mockResolvedValueOnce({ status: 'EXECUTED', executionId: 'exec-1' });
    const x402 = await import('../../src/lib/agent/payments/x402');
    const proof: X402PaymentProof = {
      paymentHash: '0xalready-executed',
      amount: '100',
      currency: 'USDC',
      chainId: 84532,
    };
    const result = await x402.executePaidAction(proof);
    expect(result.paymentId).toBe(proof.paymentHash);
    expect((result.executionResult as { idempotent?: boolean }).idempotent).toBe(true);
    expect((result.executionResult as { previousExecutionId?: string }).previousExecutionId).toBe('exec-1');
  });
});
