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
    vi.stubEnv('NODE_ENV', 'test');
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
    vi.stubEnv('NODE_ENV', 'production');
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
    process.env.ERC8004_NETWORK = ''; // no built-in registry
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
      }),
    });
  });
});

describe('registerWithRegistry', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS;
    process.env.ERC8004_NETWORK = ''; // no built-in registry → mock path
    delete process.env.EXECUTE_WALLET_PRIVATE_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns mock agentId and txHash when registry not configured', async () => {
    const { registerWithRegistry } = await import('../../src/lib/agent/identity/erc8004');
    const result = await registerWithRegistry('ipfs://QmTest');
    expect(result.agentId).toBeGreaterThanOrEqual(BigInt(0));
    expect(result.txHash).toMatch(/^mock-\d+$/);
  });
});

describe('getIdentityRegistryAddress', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns official address for default network when no override', async () => {
    delete process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS;
    const { getIdentityRegistryAddress } = await import('../../src/lib/agent/identity/erc8004');
    const addr = getIdentityRegistryAddress();
    expect(addr).toBeDefined();
    expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('returns override when ERC8004_IDENTITY_REGISTRY_ADDRESS set', async () => {
    process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
    const { getIdentityRegistryAddress } = await import('../../src/lib/agent/identity/erc8004');
    const addr = getIdentityRegistryAddress();
    expect(addr).toBe('0x8004A818BFB912233c491871b3d84c89A494BD9e');
  });
});

describe('getFeedbackSummary', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS;
    delete process.env.REPUTATION_ATTESTATION_CONTRACT_ADDRESS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns zeros when registry not configured', async () => {
    const { getFeedbackSummary } = await import('../../src/lib/agent/identity/reputation');
    const result = await getFeedbackSummary(BigInt(1), []);
    expect(result).toEqual({ count: 0, averageValue: 0, valueDecimals: 0 });
  });
});
