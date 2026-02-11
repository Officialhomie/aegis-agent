/**
 * Delegation Schemas Tests
 *
 * Tests for Zod schemas and helper functions in the delegation module.
 */

import { describe, it, expect } from 'vitest';
import {
  DelegationPermissionsSchema,
  CreateDelegationRequestSchema,
  ListDelegationsQuerySchema,
  isDelegationTimeValid,
  isWithinScope,
  isWithinValueLimit,
} from '../../../src/lib/delegation/schemas';

describe('DelegationPermissionsSchema', () => {
  it('parses valid permissions with all fields', () => {
    const input = {
      contracts: ['0x1234567890123456789012345678901234567890'],
      functions: ['0x12345678'],
      maxValuePerTx: '1000000000000000000',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    const result = DelegationPermissionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contracts).toHaveLength(1);
      expect(result.data.maxTxPerDay).toBe(50);
    }
  });

  it('uses defaults for missing optional fields', () => {
    const input = {};

    const result = DelegationPermissionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contracts).toEqual([]);
      expect(result.data.functions).toEqual([]);
      expect(result.data.maxValuePerTx).toBe('0');
      expect(result.data.maxGasPerTx).toBe(500000);
      expect(result.data.maxDailySpend).toBe(100);
      expect(result.data.maxTxPerDay).toBe(50);
      expect(result.data.maxTxPerHour).toBe(10);
    }
  });

  it('rejects invalid contract addresses', () => {
    const input = {
      contracts: ['invalid-address'],
    };

    const result = DelegationPermissionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid function selectors', () => {
    const input = {
      functions: ['not-a-selector'],
    };

    const result = DelegationPermissionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('CreateDelegationRequestSchema', () => {
  it('parses valid delegation request', () => {
    const input = {
      delegator: '0x1234567890123456789012345678901234567890',
      agent: '0x0987654321098765432109876543210987654321',
      signature: '0x' + 'ab'.repeat(65),
      signatureNonce: '1',
      permissions: {
        contracts: [],
        functions: [],
      },
      gasBudgetWei: '1000000000000000000',
      validFromMs: Date.now(),
      validUntilMs: Date.now() + 86400000,
    };

    const result = CreateDelegationRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects expired delegation', () => {
    const input = {
      delegator: '0x1234567890123456789012345678901234567890',
      agent: '0x0987654321098765432109876543210987654321',
      signature: '0x' + 'ab'.repeat(65),
      signatureNonce: '1',
      permissions: {},
      gasBudgetWei: '1000000000000000000',
      validFromMs: Date.now() - 86400000,
      validUntilMs: Date.now() - 3600000, // Already expired
    };

    const result = CreateDelegationRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects same delegator and agent', () => {
    const sameAddress = '0x1234567890123456789012345678901234567890';
    const input = {
      delegator: sameAddress,
      agent: sameAddress,
      signature: '0x' + 'ab'.repeat(65),
      signatureNonce: '1',
      permissions: {},
      gasBudgetWei: '1000000000000000000',
      validFromMs: Date.now(),
      validUntilMs: Date.now() + 86400000,
    };

    const result = CreateDelegationRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('ListDelegationsQuerySchema', () => {
  it('parses valid query with all filters', () => {
    const input = {
      delegator: '0x1234567890123456789012345678901234567890',
      agent: '0x0987654321098765432109876543210987654321',
      status: 'ACTIVE',
      limit: 25,
      offset: 10,
    };

    const result = ListDelegationsQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.limit).toBe(25);
    }
  });

  it('uses defaults for missing fields', () => {
    const input = {};

    const result = ListDelegationsQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(0);
    }
  });

  it('clamps limit to max 100', () => {
    const input = { limit: 500 };

    const result = ListDelegationsQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });
});

describe('isDelegationTimeValid', () => {
  it('returns true for valid time window', () => {
    const now = new Date();
    const validFrom = new Date(now.getTime() - 3600000); // 1 hour ago
    const validUntil = new Date(now.getTime() + 3600000); // 1 hour from now

    expect(isDelegationTimeValid(validFrom, validUntil)).toBe(true);
  });

  it('returns false for expired delegation', () => {
    const now = new Date();
    const validFrom = new Date(now.getTime() - 7200000); // 2 hours ago
    const validUntil = new Date(now.getTime() - 3600000); // 1 hour ago

    expect(isDelegationTimeValid(validFrom, validUntil)).toBe(false);
  });

  it('returns false for not yet valid delegation', () => {
    const now = new Date();
    const validFrom = new Date(now.getTime() + 3600000); // 1 hour from now
    const validUntil = new Date(now.getTime() + 7200000); // 2 hours from now

    expect(isDelegationTimeValid(validFrom, validUntil)).toBe(false);
  });
});

describe('isWithinScope', () => {
  it('returns true when contracts list is empty (all allowed)', () => {
    const permissions = {
      contracts: [],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinScope(permissions, '0x1234567890123456789012345678901234567890')).toBe(true);
  });

  it('returns true when contract is in allowed list', () => {
    const targetContract = '0x1234567890123456789012345678901234567890';
    const permissions = {
      contracts: [targetContract],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinScope(permissions, targetContract)).toBe(true);
  });

  it('returns false when contract is not in allowed list', () => {
    const permissions = {
      contracts: ['0x1111111111111111111111111111111111111111'],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinScope(permissions, '0x2222222222222222222222222222222222222222')).toBe(false);
  });

  it('handles case-insensitive comparison', () => {
    const permissions = {
      contracts: ['0xABCD567890123456789012345678901234567890'],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinScope(permissions, '0xabcd567890123456789012345678901234567890')).toBe(true);
  });
});

describe('isWithinValueLimit', () => {
  it('returns true when maxValuePerTx is 0 (no limit)', () => {
    const permissions = {
      contracts: [],
      functions: [],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinValueLimit(permissions, BigInt('1000000000000000000'))).toBe(true);
  });

  it('returns true when value is within limit', () => {
    const permissions = {
      contracts: [],
      functions: [],
      maxValuePerTx: '2000000000000000000', // 2 ETH
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinValueLimit(permissions, BigInt('1000000000000000000'))).toBe(true); // 1 ETH
  });

  it('returns false when value exceeds limit', () => {
    const permissions = {
      contracts: [],
      functions: [],
      maxValuePerTx: '1000000000000000000', // 1 ETH
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinValueLimit(permissions, BigInt('2000000000000000000'))).toBe(false); // 2 ETH
  });

  it('returns true when value equals limit', () => {
    const permissions = {
      contracts: [],
      functions: [],
      maxValuePerTx: '1000000000000000000', // 1 ETH
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    };

    expect(isWithinValueLimit(permissions, BigInt('1000000000000000000'))).toBe(true); // 1 ETH
  });
});
