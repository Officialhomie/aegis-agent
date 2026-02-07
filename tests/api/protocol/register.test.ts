/**
 * Protocol Registration API Tests
 *
 * Tests for POST /api/protocol/register
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockRequest, createMockProtocol } from '../../utils/test-helpers';

// Mock Prisma
const mockPrisma = {
  protocolSponsor: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@/src/lib/db', () => ({
  getPrisma: () => mockPrisma,
}));

describe('POST /api/protocol/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('successfully registers a new protocol', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const mockProtocol = createMockProtocol({
      protocolId: 'new-protocol',
      name: 'New Protocol',
    });

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);
    mockPrisma.protocolSponsor.create.mockResolvedValue(mockProtocol);

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'new-protocol',
        name: 'New Protocol',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.protocolId).toBe('new-protocol');
    expect(json.name).toBe('New Protocol');
    expect(json.tier).toBe('bronze');
    expect(json.createdAt).toBeDefined();
  });

  it('returns 409 for duplicate protocol ID', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(
      createMockProtocol({ protocolId: 'existing-protocol' })
    );

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'existing-protocol',
        name: 'Test Protocol',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error).toBe('Protocol already registered');
  });

  it('returns 400 for invalid protocol ID format', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'invalid protocol!@#', // Invalid characters
        name: 'Test Protocol',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });

  it('returns 400 for missing required fields', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'test-protocol',
        // Missing name
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 for empty body', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {},
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts optional tier parameter', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const mockProtocol = createMockProtocol({
      protocolId: 'gold-protocol',
      name: 'Gold Protocol',
      tier: 'gold',
    });

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);
    mockPrisma.protocolSponsor.create.mockResolvedValue(mockProtocol);

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'gold-protocol',
        name: 'Gold Protocol',
        tier: 'gold',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tier).toBe('gold');
  });

  it('validates tier enum values', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'test-protocol',
        name: 'Test Protocol',
        tier: 'platinum', // Invalid tier
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('accepts whitelisted contracts array', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const mockProtocol = createMockProtocol({
      protocolId: 'contract-protocol',
      whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
    });

    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);
    mockPrisma.protocolSponsor.create.mockResolvedValue(mockProtocol);

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'contract-protocol',
        name: 'Contract Protocol',
        whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify create was called with correct data
    expect(mockPrisma.protocolSponsor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
        }),
      })
    );
  });

  it('validates contract address format in whitelist', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'test-protocol',
        name: 'Test Protocol',
        whitelistedContracts: ['invalid-address'],
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('handles database errors gracefully', async () => {
    const { POST } = await import('../../../app/api/protocol/register/route');

    mockPrisma.protocolSponsor.findUnique.mockRejectedValue(new Error('Database error'));

    const req = createMockRequest('http://localhost/api/protocol/register', {
      method: 'POST',
      body: {
        protocolId: 'test-protocol',
        name: 'Test Protocol',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
