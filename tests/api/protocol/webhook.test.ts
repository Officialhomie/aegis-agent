/**
 * Protocol Webhook API Tests
 *
 * Tests for POST /api/protocol/webhook
 * Covers HMAC authentication, rate limiting, and payment processing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockProtocol, generateWebhookSignature, mockEnv } from '../../utils/test-helpers';

// Mock Prisma
const mockPrisma = {
  protocolSponsor: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  paymentRecord: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@/src/lib/db', () => ({
  getPrisma: () => mockPrisma,
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

const WEBHOOK_SECRET = 'test-webhook-secret-12345';

describe('POST /api/protocol/webhook', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    restoreEnv = mockEnv({ PROTOCOL_WEBHOOK_SECRET: WEBHOOK_SECRET });
  });

  afterEach(() => {
    restoreEnv();
    vi.resetAllMocks();
    vi.resetModules();
  });

  describe('HMAC Authentication', () => {
    it('accepts request with valid HMAC signature', async () => {
      // Re-import after env change
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
        paymentId: 'pay-123',
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ balanceUSD: 100 }));
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 150 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.paymentRecord.create.mockResolvedValue({});

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.creditedAmount).toBe(50);
    });

    it('rejects request with invalid signature', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
      };

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': 'invalid-signature',
          'x-aegis-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('rejects request with missing signature header', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
      };

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.details).toContain('x-aegis-signature');
    });

    it('rejects request with missing timestamp header', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
      };

      const { signature } = generateWebhookSignature(body, WEBHOOK_SECRET);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.details).toContain('x-aegis-timestamp');
    });

    it('rejects request with expired timestamp', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
      };

      // Timestamp from 10 minutes ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const { signature } = generateWebhookSignature(body, WEBHOOK_SECRET, oldTimestamp);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': oldTimestamp.toString(),
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.details).toContain('Timestamp too old');
    });

    it('bypasses auth in development when secret not configured', async () => {
      // Reset modules and set up without secret
      vi.resetModules();
      restoreEnv();
      restoreEnv = mockEnv({
        PROTOCOL_WEBHOOK_SECRET: undefined,
        NODE_ENV: 'development',
      });

      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 25,
      };

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ balanceUSD: 100 }));
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 125 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        // No auth headers
      });

      const res = await POST(req);
      // Should succeed in development without secret
      expect(res.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'rate-limit-test',
        amountUSD: 10,
      };

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ protocolId: 'rate-limit-test' }));
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 110 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.paymentRecord.create.mockResolvedValue({});

      // Send 11 requests (limit is 10)
      for (let i = 0; i < 11; i++) {
        const { signature, timestamp } = generateWebhookSignature(
          { ...body, paymentId: `pay-${i}` },
          WEBHOOK_SECRET
        );

        const req = createMockRequest('http://localhost/api/protocol/webhook', {
          method: 'POST',
          body: { ...body, paymentId: `pay-${i}` },
          headers: {
            'x-aegis-signature': signature,
            'x-aegis-timestamp': timestamp,
          },
        });

        const res = await POST(req);

        if (i < 10) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(429);
          const json = await res.json();
          expect(json.error).toBe('Rate limit exceeded');
        }
      }
    });

    it('includes rate limit headers in response', async () => {
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'header-test-protocol',
        amountUSD: 10,
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol());
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 110 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.paymentRecord.create.mockResolvedValue({});

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Payment Processing', () => {
    it('credits protocol balance correctly', async () => {
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'credit-test',
        amountUSD: 75,
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ protocolId: 'credit-test', balanceUSD: 100 }));
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 175 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.balanceUSD).toBe(175);
      expect(json.creditedAmount).toBe(75);

      // Verify update was called with correct increment
      expect(mockPrisma.protocolSponsor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balanceUSD: expect.objectContaining({ increment: 75 }),
          }),
        })
      );
    });

    it('handles duplicate payment (idempotency)', async () => {
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'idempotent-test',
        amountUSD: 50,
        paymentId: 'duplicate-payment-123',
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ protocolId: 'idempotent-test', balanceUSD: 200 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue({ paymentHash: 'duplicate-payment-123' });

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.duplicate).toBe(true);
      expect(json.creditedAmount).toBe(0);
      expect(json.message).toContain('already processed');

      // Verify update was NOT called
      expect(mockPrisma.protocolSponsor.update).not.toHaveBeenCalled();
    });

    it('records payment for audit trail', async () => {
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'audit-test',
        amountUSD: 100,
        paymentId: 'payment-for-audit',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(createMockProtocol({ protocolId: 'audit-test' }));
      mockPrisma.protocolSponsor.update.mockResolvedValue(createMockProtocol({ balanceUSD: 200 }));
      mockPrisma.paymentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.paymentRecord.create.mockResolvedValue({});

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      await POST(req);

      expect(mockPrisma.paymentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentHash: 'payment-for-audit',
            amount: BigInt(100_000_000), // 100 USD in 6 decimals
            currency: 'USDC',
            status: 'CONFIRMED',
          }),
        })
      );
    });

    it('returns 404 for non-existent protocol', async () => {
      vi.resetModules();
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'non-existent',
        amountUSD: 50,
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Protocol not found');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid payload schema', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: '', // Empty string, invalid
        amountUSD: -50, // Negative, invalid
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid webhook payload');
    });

    it('validates txHash format when provided', async () => {
      const { POST } = await import('../../../app/api/protocol/webhook/route');

      const body = {
        protocolId: 'test-protocol',
        amountUSD: 50,
        txHash: 'invalid-tx-hash',
      };

      const { signature, timestamp } = generateWebhookSignature(body, WEBHOOK_SECRET);

      const req = createMockRequest('http://localhost/api/protocol/webhook', {
        method: 'POST',
        body,
        headers: {
          'x-aegis-signature': signature,
          'x-aegis-timestamp': timestamp,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});

describe('GET /api/protocol/webhook', () => {
  it('returns webhook configuration info', async () => {
    const { GET } = await import('../../../app/api/protocol/webhook/route');

    const req = createMockRequest('http://localhost/api/protocol/webhook', {
      method: 'GET',
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.headers).toBeDefined();
    expect(json.headers.signature).toBe('X-Aegis-Signature');
    expect(json.headers.timestamp).toBe('X-Aegis-Timestamp');
    expect(json.rateLimit).toBeDefined();
    expect(json.signatureFormat).toBeDefined();
  });
});
