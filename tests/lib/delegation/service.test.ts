/**
 * Delegation Service Tests
 *
 * Tests for the delegation service business logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database before importing the service
vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn(),
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/lib/delegation/eip712', () => ({
  verifyDelegationSignature: vi.fn().mockResolvedValue(true),
  hashPermissions: vi.fn().mockReturnValue('0x' + 'ab'.repeat(32)),
}));

// Import after mocks
import { getPrisma } from '../../../src/lib/db';
import {
  createDelegation,
  revokeDelegation,
  getDelegation,
  listDelegations,
  hasValidDelegation,
  validateDelegationForTransaction,
  deductDelegationBudget,
  rollbackDelegationBudget,
} from '../../../src/lib/delegation/service';
import type { CreateDelegationRequest } from '../../../src/lib/delegation/schemas';

const mockPrisma = {
  delegation: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  delegationUsage: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (getPrisma as ReturnType<typeof vi.fn>).mockReturnValue(mockPrisma);
});

describe('createDelegation', () => {
  const validRequest: CreateDelegationRequest = {
    delegator: '0x1234567890123456789012345678901234567890',
    agent: '0x0987654321098765432109876543210987654321',
    signature: '0x' + 'ab'.repeat(65),
    signatureNonce: '1',
    permissions: {
      contracts: [],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    },
    gasBudgetWei: '1000000000000000000',
    validFromMs: Date.now(),
    validUntilMs: Date.now() + 86400000,
  };

  it('creates delegation successfully', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: validRequest.delegator.toLowerCase(),
      agent: validRequest.agent.toLowerCase(),
      agentOnChainId: null,
      signature: validRequest.signature,
      signatureNonce: BigInt(1),
      permissions: validRequest.permissions,
      gasBudgetWei: BigInt(validRequest.gasBudgetWei),
      gasBudgetSpent: BigInt(0),
      status: 'ACTIVE',
      validFrom: new Date(validRequest.validFromMs),
      validUntil: new Date(validRequest.validUntilMs),
      revokedAt: null,
      revokedReason: null,
      onChainTxHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.delegation.findFirst.mockResolvedValue(null); // No existing delegation
    mockPrisma.delegation.create.mockResolvedValue(mockDelegation);

    const result = await createDelegation(validRequest);

    expect(result.success).toBe(true);
    expect(result.delegation).toBeDefined();
    expect(result.delegation?.delegator).toBe(validRequest.delegator.toLowerCase());
    expect(mockPrisma.delegation.create).toHaveBeenCalled();
  });

  it('fails when delegation with same nonce exists', async () => {
    mockPrisma.delegation.findFirst.mockResolvedValue({
      id: 'existing-delegation',
    });

    const result = await createDelegation(validRequest);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });
});

describe('revokeDelegation', () => {
  it('revokes active delegation successfully', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE',
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);
    mockPrisma.delegation.update.mockResolvedValue({
      ...mockDelegation,
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedReason: 'Test revocation',
    });

    const result = await revokeDelegation(
      'test-delegation-id',
      '0x1234567890123456789012345678901234567890',
      'Test revocation'
    );

    expect(result.success).toBe(true);
    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-delegation-id' },
        data: expect.objectContaining({
          status: 'REVOKED',
          revokedReason: 'Test revocation',
        }),
      })
    );
  });

  it('fails when delegation not found', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue(null);

    const result = await revokeDelegation(
      'nonexistent-id',
      '0x1234567890123456789012345678901234567890',
      'Test revocation'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('fails when caller is not delegator', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1111111111111111111111111111111111111111',
      status: 'ACTIVE',
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);

    const result = await revokeDelegation(
      'test-delegation-id',
      '0x2222222222222222222222222222222222222222',
      'Test revocation'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only delegator');
  });

  it('fails when delegation already revoked', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1234567890123456789012345678901234567890',
      status: 'REVOKED',
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);

    const result = await revokeDelegation(
      'test-delegation-id',
      '0x1234567890123456789012345678901234567890',
      'Test revocation'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('already');
  });
});

describe('hasValidDelegation', () => {
  it('returns valid when agent has active delegation', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1111111111111111111111111111111111111111',
      agent: '0x2222222222222222222222222222222222222222',
      status: 'ACTIVE',
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 3600000),
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('0'),
    };

    mockPrisma.delegation.findFirst.mockResolvedValue(mockDelegation);

    const result = await hasValidDelegation('0x2222222222222222222222222222222222222222');

    expect(result.valid).toBe(true);
    expect(result.delegationId).toBe('test-delegation-id');
    expect(result.delegator).toBe(mockDelegation.delegator);
  });

  it('returns invalid when no active delegation', async () => {
    mockPrisma.delegation.findFirst.mockResolvedValue(null);

    const result = await hasValidDelegation('0x2222222222222222222222222222222222222222');

    expect(result.valid).toBe(false);
  });

  it('returns invalid when delegation budget exhausted', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1111111111111111111111111111111111111111',
      agent: '0x2222222222222222222222222222222222222222',
      status: 'ACTIVE',
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 3600000),
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('1000000000000000000'), // Fully spent
    };

    mockPrisma.delegation.findFirst.mockResolvedValue(mockDelegation);

    const result = await hasValidDelegation('0x2222222222222222222222222222222222222222');

    expect(result.valid).toBe(false);
  });
});

describe('validateDelegationForTransaction', () => {
  it('returns valid for transaction within scope', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1111111111111111111111111111111111111111',
      agent: '0x2222222222222222222222222222222222222222',
      status: 'ACTIVE',
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 3600000),
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('0'),
      permissions: {
        contracts: [],
        functions: [],
        maxValuePerTx: '0',
        maxGasPerTx: 500000,
        maxDailySpend: 100,
        maxTxPerDay: 50,
        maxTxPerHour: 10,
      },
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);
    mockPrisma.delegationUsage.count.mockResolvedValue(0);

    const result = await validateDelegationForTransaction('test-delegation-id', {
      agentAddress: '0x2222222222222222222222222222222222222222',
      targetContract: '0x3333333333333333333333333333333333333333',
      valueWei: BigInt(0),
      estimatedGasWei: BigInt(100000000000000), // 0.0001 ETH
    });

    expect(result.valid).toBe(true);
  });

  it('returns invalid when delegation not found', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue(null);

    const result = await validateDelegationForTransaction('nonexistent-id', {
      agentAddress: '0x2222222222222222222222222222222222222222',
      targetContract: '0x3333333333333333333333333333333333333333',
      valueWei: BigInt(0),
      estimatedGasWei: BigInt(100000000000000),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns invalid when contract not in scope', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      delegator: '0x1111111111111111111111111111111111111111',
      agent: '0x2222222222222222222222222222222222222222',
      status: 'ACTIVE',
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 3600000),
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('0'),
      permissions: {
        contracts: ['0x4444444444444444444444444444444444444444'], // Only this contract allowed
        functions: [],
        maxValuePerTx: '0',
        maxGasPerTx: 500000,
        maxDailySpend: 100,
        maxTxPerDay: 50,
        maxTxPerHour: 10,
      },
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);

    const result = await validateDelegationForTransaction('test-delegation-id', {
      agentAddress: '0x2222222222222222222222222222222222222222',
      targetContract: '0x3333333333333333333333333333333333333333', // Different contract
      valueWei: BigInt(0),
      estimatedGasWei: BigInt(100000000000000),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not in scope');
  });
});

describe('deductDelegationBudget', () => {
  it('deducts budget successfully', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('0'),
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);
    mockPrisma.delegation.update.mockResolvedValue({
      ...mockDelegation,
      gasBudgetSpent: BigInt('100000000000000'),
    });

    const result = await deductDelegationBudget('test-delegation-id', BigInt('100000000000000'));

    expect(result.success).toBe(true);
    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-delegation-id' },
        data: expect.objectContaining({
          gasBudgetSpent: BigInt('100000000000000'),
        }),
      })
    );
  });

  it('fails when delegation not found', async () => {
    mockPrisma.delegation.findUnique.mockResolvedValue(null);

    const result = await deductDelegationBudget('nonexistent-id', BigInt('100000000000000'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('fails when insufficient budget', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('100000000000000'),
      gasBudgetSpent: BigInt('50000000000000'),
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);

    const result = await deductDelegationBudget(
      'test-delegation-id',
      BigInt('100000000000000') // More than remaining
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient');
  });
});

describe('rollbackDelegationBudget', () => {
  it('rolls back budget successfully', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('100000000000000'),
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);
    mockPrisma.delegation.update.mockResolvedValue({
      ...mockDelegation,
      gasBudgetSpent: BigInt('0'),
    });

    await rollbackDelegationBudget('test-delegation-id', BigInt('100000000000000'));

    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-delegation-id' },
        data: expect.objectContaining({
          gasBudgetSpent: BigInt('0'),
        }),
      })
    );
  });

  it('does not set negative budget', async () => {
    const mockDelegation = {
      id: 'test-delegation-id',
      gasBudgetWei: BigInt('1000000000000000000'),
      gasBudgetSpent: BigInt('50000000000000'),
    };

    mockPrisma.delegation.findUnique.mockResolvedValue(mockDelegation);
    mockPrisma.delegation.update.mockImplementation(async ({ data }) => ({
      ...mockDelegation,
      gasBudgetSpent: data.gasBudgetSpent,
    }));

    await rollbackDelegationBudget(
      'test-delegation-id',
      BigInt('100000000000000') // More than spent
    );

    // Should clamp to 0, not go negative
    expect(mockPrisma.delegation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gasBudgetSpent: BigInt('0'),
        }),
      })
    );
  });
});
