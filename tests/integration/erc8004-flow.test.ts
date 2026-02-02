/**
 * ERC-8004 flow integration test (register -> record -> read summary)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerWithRegistry,
  getFeedbackSummary,
  recordExecution,
  getReputationScore,
  calculateQualityScore,
} from '../../src/lib/agent/identity';
import type { ExecutionResult } from '../../src/lib/agent/execute';

const originalEnv = process.env;

const mockCreate = vi.fn().mockResolvedValue({ id: 'attest-1' });
const mockFindMany = vi.fn().mockResolvedValue([]);
const mockCount = vi.fn().mockResolvedValue(0);
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: unknown) {
    return {
      reputationAttestation: {
        create: mockCreate,
        findMany: mockFindMany,
        count: mockCount,
      },
    };
  }),
}));

describe('ERC-8004 Integration', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS;
    delete process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS;
    delete process.env.EXECUTE_WALLET_PRIVATE_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    mockCreate.mockResolvedValue({ id: 'attest-1' });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('registers agent (mock) and returns agentId and txHash', async () => {
    const result = await registerWithRegistry('ipfs://QmTest');
    expect(result.agentId).toBeGreaterThanOrEqual(BigInt(0));
    expect(result.txHash).toMatch(/^mock-\d+$/);
  });

  it('getFeedbackSummary returns zeros when registry not configured', async () => {
    const result = await getFeedbackSummary(BigInt(1), []);
    expect(result).toEqual({ count: 0, averageValue: 0, valueDecimals: 0 });
  });

  it('recordExecution creates DB attestation and returns id', async () => {
    const execution: ExecutionResult = {
      success: true,
      transactionHash: '0xabc',
      gasUsed: BigInt(100000),
    };
    const id = await recordExecution('1', execution, 84532);
    expect(id).toBe('attest-1');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentOnChainId: '1',
        attestationType: 'SUCCESS',
        chainId: 84532,
        score: expect.any(Number),
      }),
    });
  });

  it('calculateQualityScore returns 0 for failed execution', () => {
    const score = calculateQualityScore({ success: false });
    expect(score).toBe(0);
  });

  it('calculateQualityScore returns higher score for successful execution with txHash', () => {
    const score = calculateQualityScore({
      success: true,
      transactionHash: '0xabc',
      gasUsed: BigInt(50000),
    });
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('getReputationScore returns count and averageScore', async () => {
    const result = await getReputationScore('1');
    expect(result).toHaveProperty('averageScore');
    expect(result).toHaveProperty('count');
    expect(typeof result.averageScore).toBe('number');
    expect(typeof result.count).toBe('number');
  });
});
