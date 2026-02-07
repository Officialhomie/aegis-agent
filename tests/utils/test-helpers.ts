/**
 * Test Utilities for Aegis Agent API Tests
 */

import { vi } from 'vitest';
import { createHmac } from 'crypto';

/**
 * Generate HMAC signature for webhook testing.
 */
export function generateWebhookSignature(
  body: unknown,
  secret: string,
  timestamp?: number
): { signature: string; timestamp: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = `${ts}.${JSON.stringify(body)}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return {
    signature,
    timestamp: ts.toString(),
  };
}

/**
 * Create a mock Request object for testing.
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = 'GET', body, headers = {} } = options;

  const requestOptions: RequestInit = {
    method,
    headers,
  };

  if (body) {
    requestOptions.body = JSON.stringify(body);
    requestOptions.headers = {
      ...headers,
      'Content-Type': 'application/json',
    };
  }

  return new Request(url, requestOptions);
}

/**
 * Create a mock protocol for testing.
 */
export function createMockProtocol(overrides: Partial<{
  id: string;
  protocolId: string;
  name: string;
  balanceUSD: number;
  totalSpent: number;
  sponsorshipCount: number;
  tier: string;
  whitelistedContracts: string[];
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'cuid-123',
    protocolId: 'test-protocol',
    name: 'Test Protocol',
    balanceUSD: 100,
    totalSpent: 0,
    sponsorshipCount: 0,
    tier: 'bronze',
    whitelistedContracts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock deposit transaction.
 */
export function createMockDeposit(overrides: Partial<{
  id: string;
  protocolId: string;
  txHash: string;
  amount: number;
  tokenAmount: bigint;
  tokenSymbol: string;
  chainId: number;
  confirmed: boolean;
  blockNumber: bigint | null;
  confirmedAt: Date | null;
  senderAddress: string;
  createdAt: Date;
}> = {}) {
  return {
    id: 'deposit-123',
    protocolId: 'test-protocol',
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    amount: 100,
    tokenAmount: BigInt(100_000_000),
    tokenSymbol: 'USDC',
    chainId: 8453,
    confirmed: true,
    blockNumber: BigInt(12345678),
    confirmedAt: new Date(),
    senderAddress: '0x1234567890abcdef1234567890abcdef12345678',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock Prisma client for testing.
 */
export function createMockPrismaClient() {
  return {
    protocolSponsor: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    depositTransaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    approvedAgent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

/**
 * Save and restore environment variables.
 */
export function mockEnv(overrides: Record<string, string | undefined>) {
  const originalEnv = { ...process.env };

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  return () => {
    process.env = originalEnv;
  };
}
