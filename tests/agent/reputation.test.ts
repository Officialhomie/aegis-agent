/**
 * Reputation attestation and quality score tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateQualityScore,
  submitReputationAttestation,
  getReputationScore,
  type ReputationAttestationInput,
} from '../../src/lib/agent/identity/reputation';
import type { ExecutionResult } from '../../src/lib/agent/execute';

const mockCreate = vi.fn().mockResolvedValue({ id: 'att-1' });
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

describe('calculateQualityScore', () => {
  it('returns 0 when execution failed', () => {
    expect(calculateQualityScore({ success: false } as ExecutionResult)).toBe(0);
  });

  it('returns base 50 when success only', () => {
    expect(calculateQualityScore({ success: true } as ExecutionResult)).toBe(50);
  });

  it('adds 20 for transactionHash', () => {
    expect(
      calculateQualityScore({
        success: true,
        transactionHash: '0xabc',
      } as ExecutionResult)
    ).toBe(70);
  });

  it('adds 15 for gasUsed < 100k', () => {
    expect(
      calculateQualityScore({
        success: true,
        gasUsed: BigInt(50_000),
      } as ExecutionResult)
    ).toBe(65);
  });

  it('adds 10 for gasUsed < 500k', () => {
    expect(
      calculateQualityScore({
        success: true,
        gasUsed: BigInt(200_000),
      } as ExecutionResult)
    ).toBe(60);
  });

  it('adds 15 for simulationResult without error', () => {
    expect(
      calculateQualityScore({
        success: true,
        simulationResult: { success: true },
      } as ExecutionResult)
    ).toBe(65);
  });

  it('caps at 100', () => {
    expect(
      calculateQualityScore({
        success: true,
        transactionHash: '0x',
        gasUsed: BigInt(1),
        simulationResult: {},
      } as ExecutionResult)
    ).toBe(100);
  });
});

describe('submitReputationAttestation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REPUTATION_ATTESTATION_CONTRACT_ADDRESS;
    mockCreate.mockResolvedValue({ id: 'att-1' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates attestation in DB and returns id', async () => {
    const input: ReputationAttestationInput = {
      agentOnChainId: 'token-1',
      attestor: '0xattestor',
      attestationType: 'SUCCESS',
      score: 80,
      chainId: 84532,
    };
    const id = await submitReputationAttestation(input);
    expect(id).toBe('att-1');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentOnChainId: input.agentOnChainId,
        attestor: input.attestor,
        attestationType: input.attestationType,
        score: input.score,
        chainId: input.chainId,
      }),
    });
  });
});

describe('getReputationScore', () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([{ score: 80 }, { score: 90 }]);
    mockCount.mockResolvedValue(2);
  });

  it('returns average and count with pagination', async () => {
    const result = await getReputationScore('agent-1', { take: 10, skip: 0 });
    expect(result.averageScore).toBe(85);
    expect(result.count).toBe(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentOnChainId: 'agent-1' },
        take: 10,
        skip: 0,
      })
    );
  });

  it('returns 0 when no attestations', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);
    const result = await getReputationScore('agent-1');
    expect(result.averageScore).toBe(0);
    expect(result.count).toBe(0);
  });
});
