/**
 * Security tests: API auth, payment verification, HMAC, input validation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { AgentCycleRequestSchema, ReactiveEventSchema } from '@/src/lib/api/schemas';
import { maskSensitiveData } from '@/src/lib/security/data-masking';

// Prevent agent/reason chain from loading (OpenAI client) when testing x402
vi.mock('@/src/lib/agent', () => ({ runAgentCycle: vi.fn() }));
vi.mock('@/src/lib/agent/identity/reputation', () => ({ recordExecution: vi.fn() }));
import { verifyX402Payment } from '@/src/lib/agent/payments/x402';

describe('SEC-001: API Authentication', () => {
  const originalApiKey = process.env.AEGIS_API_KEY;

  afterEach(() => {
    process.env.AEGIS_API_KEY = originalApiKey;
  });

  it('returns invalid when AEGIS_API_KEY is not configured', () => {
    delete process.env.AEGIS_API_KEY;
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer any-token' },
    });
    const result = verifyApiAuth(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('returns invalid when Authorization header is missing', () => {
    process.env.AEGIS_API_KEY = 'secret-key';
    const req = new Request('https://example.com');
    const result = verifyApiAuth(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Bearer');
  });

  it('returns invalid when token does not start with Bearer ', () => {
    process.env.AEGIS_API_KEY = 'secret-key';
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Basic xyz' },
    });
    const result = verifyApiAuth(req);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when token is wrong', () => {
    process.env.AEGIS_API_KEY = 'correct-secret-key';
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const result = verifyApiAuth(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('returns valid when token matches AEGIS_API_KEY', () => {
    process.env.AEGIS_API_KEY = 'correct-secret-key';
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer correct-secret-key' },
    });
    const result = verifyApiAuth(req);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('SEC-002: Payment Verification', () => {
  const originalFacilitator = process.env.X402_FACILITATOR_URL;

  afterEach(() => {
    process.env.X402_FACILITATOR_URL = originalFacilitator;
  });

  it('throws when X402_FACILITATOR_URL is not set', async () => {
    delete process.env.X402_FACILITATOR_URL;
    const proof = {
      paymentHash: '0xabc',
      amount: '100',
      currency: 'USD',
      chainId: 1,
    };
    await expect(verifyX402Payment(proof)).rejects.toThrow(
      'Payment verification unavailable'
    );
    await expect(verifyX402Payment(proof)).rejects.toThrow(
      'X402_FACILITATOR_URL not configured'
    );
  });

  it('throws when proof is missing required fields', async () => {
    process.env.X402_FACILITATOR_URL = 'https://facilitator.example.com';
    await expect(
      verifyX402Payment({
        paymentHash: '',
        amount: '100',
        currency: 'USD',
        chainId: 1,
      })
    ).rejects.toThrow('Invalid payment proof: missing required fields');
    await expect(
      verifyX402Payment({
        paymentHash: '0xabc',
        amount: '',
        currency: 'USD',
        chainId: 1,
      })
    ).rejects.toThrow('Invalid payment proof: missing required fields');
    await expect(
      verifyX402Payment({
        paymentHash: '0xabc',
        amount: '100',
        currency: 'USD',
        chainId: 0,
      } as unknown as Parameters<typeof verifyX402Payment>[0])
    ).rejects.toThrow('Invalid payment proof');
  });
});

describe('SEC-003: Reactive HMAC (signature computation)', () => {
  it('computes HMAC-SHA256 hex digest that verifies with same secret and body', () => {
    const secret = 'test-secret';
    const body = '{"chainId":1,"event":"Transfer","data":{}}';
    const expectedSig = createHmac('sha256', secret).update(body).digest('hex');
    expect(expectedSig).toMatch(/^[a-f0-9]{64}$/);
    // Verification would compare request header with this digest
    const sig2 = createHmac('sha256', secret).update(body).digest('hex');
    expect(sig2).toBe(expectedSig);
  });

  it('different body or secret produces different signature', () => {
    const secret = 'test-secret';
    const body1 = '{"chainId":1}';
    const body2 = '{"chainId":2}';
    const sig1 = createHmac('sha256', secret).update(body1).digest('hex');
    const sig2 = createHmac('sha256', secret).update(body2).digest('hex');
    expect(sig1).not.toBe(sig2);
    const sig3 = createHmac('sha256', 'other-secret').update(body1).digest('hex');
    expect(sig1).not.toBe(sig3);
  });
});

describe('SEC-004: Input Validation (Zod)', () => {
  describe('AgentCycleRequestSchema', () => {
    it('accepts valid request with SIMULATION', () => {
      const result = AgentCycleRequestSchema.safeParse({
        confidenceThreshold: 0.8,
        maxTransactionValueUsd: 5000,
        executionMode: 'SIMULATION',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.executionMode).toBe('SIMULATION');
      }
    });

    it('accepts READONLY executionMode', () => {
      const result = AgentCycleRequestSchema.safeParse({
        executionMode: 'READONLY',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.executionMode).toBe('READONLY');
      }
    });

    it('rejects LIVE executionMode from external requests', () => {
      const result = AgentCycleRequestSchema.safeParse({
        executionMode: 'LIVE',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid confidenceThreshold', () => {
      expect(AgentCycleRequestSchema.safeParse({ confidenceThreshold: 1.5 }).success).toBe(false);
      expect(AgentCycleRequestSchema.safeParse({ confidenceThreshold: -0.1 }).success).toBe(false);
    });

    it('rejects negative maxTransactionValueUsd', () => {
      const result = AgentCycleRequestSchema.safeParse({ maxTransactionValueUsd: -1 });
      expect(result.success).toBe(false);
    });

    it('applies defaults for missing optional fields', () => {
      const result = AgentCycleRequestSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidenceThreshold).toBe(0.75);
        expect(result.data.maxTransactionValueUsd).toBe(10000);
        expect(result.data.executionMode).toBe('SIMULATION');
      }
    });
  });

  describe('ReactiveEventSchema', () => {
    it('accepts valid event payload', () => {
      const result = ReactiveEventSchema.safeParse({
        chainId: 1,
        event: 'Transfer',
        data: { from: '0xabc', to: '0xdef' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing chainId', () => {
      const result = ReactiveEventSchema.safeParse({
        event: 'Transfer',
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid chainId (non-positive)', () => {
      const result = ReactiveEventSchema.safeParse({
        chainId: 0,
        event: 'Transfer',
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty event string', () => {
      const result = ReactiveEventSchema.safeParse({
        chainId: 1,
        event: '',
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('SEC-006: Data Masking', () => {
  it('masks wallet addresses in strings', () => {
    const input = 'From 0x1234567890123456789012345678901234567890 to 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const masked = maskSensitiveData(input) as string;
    expect(masked).toContain('0x1234...7890');
    expect(masked).toContain('0xabcd...abcd');
    expect(masked).not.toContain('12345678901234567890123456789012345678');
  });

  it('redacts sensitive keys in objects', () => {
    const input = {
      address: '0x1234567890123456789012345678901234567890',
      privateKey: 'secret-key-value',
      apiKey: 'sk-xxx',
    };
    const masked = maskSensitiveData(input) as Record<string, unknown>;
    expect(masked.privateKey).toBe('[REDACTED]');
    expect(masked.apiKey).toBe('[REDACTED]');
    expect(masked.address).toContain('0x1234...7890');
  });

  it('masks recursively in arrays', () => {
    const input = ['0x1234567890123456789012345678901234567890', { secret: 'x' }];
    const masked = maskSensitiveData(input) as unknown[];
    expect(masked[0]).toContain('0x1234...7890');
    expect((masked[1] as Record<string, unknown>).secret).toBe('[REDACTED]');
  });
});
