/**
 * ERC-8004 identity registration and metadata upload tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentMetadata } from '../../src/lib/agent/identity/erc8004';

const originalEnv = process.env;

const mockAgentUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: unknown) {
    return {
      agent: { update: mockAgentUpdate },
    };
  }),
}));

describe('uploadToIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns data URI when IPFS_GATEWAY_URL not set (non-production)', async () => {
    delete process.env.IPFS_GATEWAY_URL;
    process.env.NODE_ENV = 'test';
    const { uploadToIPFS } = await import('../../src/lib/agent/identity/erc8004');
    const metadata: AgentMetadata = {
      name: 'Test Agent',
      capabilities: ['observe'],
      version: '1.0.0',
      created: new Date().toISOString(),
    };
    const uri = await uploadToIPFS(metadata);
    expect(uri).toMatch(/^data:application\/json,/);
    expect(uri).toContain(encodeURIComponent(JSON.stringify(metadata)));
  });

  it('throws when IPFS_GATEWAY_URL not set in production', async () => {
    delete process.env.IPFS_GATEWAY_URL;
    process.env.NODE_ENV = 'production';
    const { uploadToIPFS } = await import('../../src/lib/agent/identity/erc8004');
    const metadata: AgentMetadata = {
      name: 'Test',
      capabilities: [],
      version: '1.0.0',
      created: new Date().toISOString(),
    };
    await expect(uploadToIPFS(metadata)).rejects.toThrow('IPFS_GATEWAY_URL not configured');
  });

  it('returns ipfs:// CID when gateway returns valid Hash', async () => {
    process.env.IPFS_GATEWAY_URL = 'https://ipfs.example.com';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Hash: 'QmTest1234567890abcdef' }),
    });
    const { uploadToIPFS } = await import('../../src/lib/agent/identity/erc8004');
    const metadata: AgentMetadata = {
      name: 'Test',
      capabilities: [],
      version: '1.0.0',
      created: new Date().toISOString(),
    };
    const uri = await uploadToIPFS(metadata);
    expect(uri).toBe('ipfs://QmTest1234567890abcdef');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v0/add'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when IPFS response missing valid CID', async () => {
    process.env.IPFS_GATEWAY_URL = 'https://ipfs.example.com';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const { uploadToIPFS } = await import('../../src/lib/agent/identity/erc8004');
    const metadata: AgentMetadata = {
      name: 'Test',
      capabilities: [],
      version: '1.0.0',
      created: new Date().toISOString(),
    };
    await expect(uploadToIPFS(metadata)).rejects.toThrow('missing valid CID');
  });
});

describe('registerAgentIdentity', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.IPFS_GATEWAY_URL;
    delete process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS;
    delete process.env.EXECUTE_WALLET_PRIVATE_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    mockAgentUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns mock tokenId when registry not configured', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { registerAgentIdentity } = await import('../../src/lib/agent/identity/erc8004');
    const tokenId = await registerAgentIdentity('agent-1', 'Aegis', ['observe']);
    expect(tokenId).toMatch(/^mock-\d+$/);
    expect(mockAgentUpdate).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: expect.objectContaining({
        onChainId: expect.stringMatching(/^mock-\d+$/),
        walletAddress: expect.any(String),
      }),
    });
  });
});
