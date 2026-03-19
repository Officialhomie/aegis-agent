/**
 * Budget module unit tests (reserveAgentBudget, commitReservation, releaseReservation, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reserveAgentBudget,
  commitReservation,
  releaseReservation,
  getAgentDailySpend,
  checkAgentBudget,
} from '../../../src/lib/agent/budget';

const mockSetNX = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockSet = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockApprovedAgentFindUnique = vi.hoisted(() => vi.fn());
const mockAgentSpendLedgerFindMany = vi.hoisted(() => vi.fn());
const mockAgentSpendLedgerAggregate = vi.hoisted(() => vi.fn());
const mockAgentSpendLedgerCreate = vi.hoisted(() => vi.fn());
const mockAgentSpendLedgerUpdate = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: mockSet,
    setNX: mockSetNX,
    eval: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    approvedAgent: {
      findUnique: mockApprovedAgentFindUnique,
    },
    agentSpendLedger: {
      findMany: mockAgentSpendLedgerFindMany,
      aggregate: mockAgentSpendLedgerAggregate,
      create: mockAgentSpendLedgerCreate,
      update: mockAgentSpendLedgerUpdate,
    },
  }),
}));

describe('reserveAgentBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetNX.mockResolvedValue(true);
    mockApprovedAgentFindUnique.mockResolvedValue({
      maxDailyBudget: 100,
      isActive: true,
    });
    mockAgentSpendLedgerAggregate.mockResolvedValue({ _sum: { estimatedUSD: 10 } });
    mockAgentSpendLedgerCreate.mockResolvedValue({ id: 'ledger-1' });
  });

  it('returns reserved: true when budget available and lock acquired', async () => {
    const result = await reserveAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      5,
      2
    );
    expect(result.reserved).toBe(true);
    expect(result.reservationId).toBeDefined();
    expect(mockAgentSpendLedgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolId: 'test-protocol',
          status: 'RESERVED',
          estimatedUSD: 5,
          agentTier: 2,
        }),
      })
    );
  });

  it('returns reserved: false when daily spend exceeds maxDailyBudget', async () => {
    mockAgentSpendLedgerAggregate.mockResolvedValue({ _sum: { estimatedUSD: 95 } });
    const result = await reserveAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      10,
      2
    );
    expect(result.reserved).toBe(false);
    expect(result.error).toContain('budget exceeded');
    expect(mockAgentSpendLedgerCreate).not.toHaveBeenCalled();
  });

  it('returns reserved: false when Redis lock fails', async () => {
    mockSetNX.mockResolvedValue(false);
    const result = await reserveAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      5,
      2
    );
    expect(result.reserved).toBe(false);
    expect(result.error).toContain('lock');
    expect(mockAgentSpendLedgerCreate).not.toHaveBeenCalled();
  });

  it('returns reserved: false when agent not approved or inactive', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue({ maxDailyBudget: 100, isActive: false });
    const result = await reserveAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      5,
      2
    );
    expect(result.reserved).toBe(false);
    expect(result.error).toContain('not approved');
  });
});

describe('commitReservation', () => {
  beforeEach(() => {
    mockAgentSpendLedgerUpdate.mockResolvedValue({});
  });

  it('updates ledger row to COMMITTED with userOpHash and actualUSD', async () => {
    await commitReservation('res-123', {
      amountUSD: 0.25,
      userOpHash: '0xabc',
      txHash: '0xdef',
    });
    expect(mockAgentSpendLedgerUpdate).toHaveBeenCalledWith({
      where: { reservationId: 'res-123' },
      data: expect.objectContaining({
        status: 'COMMITTED',
        actualUSD: 0.25,
        userOpHash: '0xabc',
        txHash: '0xdef',
      }),
    });
  });
});

describe('releaseReservation', () => {
  beforeEach(() => {
    mockAgentSpendLedgerUpdate.mockResolvedValue({});
  });

  it('updates ledger row to RELEASED with reason', async () => {
    await releaseReservation('res-123', 'bundler-submission-failed');
    expect(mockAgentSpendLedgerUpdate).toHaveBeenCalledWith({
      where: { reservationId: 'res-123' },
      data: expect.objectContaining({
        status: 'RELEASED',
      }),
    });
  });
});

describe('getAgentDailySpend', () => {
  beforeEach(() => {
    mockAgentSpendLedgerFindMany.mockResolvedValue([
      { estimatedUSD: 10, actualUSD: 10, status: 'COMMITTED' },
      { estimatedUSD: 5, actualUSD: null, status: 'RESERVED' },
    ]);
    mockApprovedAgentFindUnique.mockResolvedValue({ maxDailyBudget: 100 });
  });

  it('returns correct committed + reserved totals', async () => {
    const usage = await getAgentDailySpend('test-protocol', '0x1234567890123456789012345678901234567890');
    expect(usage.committedUSD).toBe(10);
    expect(usage.reservedUSD).toBe(5);
    expect(usage.totalUSD).toBe(15);
    expect(usage.maxDailyBudget).toBe(100);
    expect(usage.remainingUSD).toBe(85);
  });
});

describe('checkAgentBudget', () => {
  beforeEach(() => {
    mockAgentSpendLedgerFindMany.mockResolvedValue([
      { estimatedUSD: 10, actualUSD: 10, status: 'COMMITTED' },
    ]);
    mockApprovedAgentFindUnique.mockResolvedValue({ maxDailyBudget: 100 });
  });

  it('returns allowed: true when remaining budget > estimatedCost', async () => {
    const result = await checkAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      5
    );
    expect(result.allowed).toBe(true);
  });

  it('returns allowed: false when projected exceeds limit', async () => {
    mockAgentSpendLedgerFindMany.mockResolvedValue([
      { estimatedUSD: 95, actualUSD: 95, status: 'COMMITTED' },
    ]);
    const result = await checkAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      10
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeded');
  });

  it('returns allowed: true when maxDailyBudget is 0 (no per-agent limit)', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue({ maxDailyBudget: 0 });
    const result = await checkAgentBudget(
      'test-protocol',
      '0x1234567890123456789012345678901234567890',
      100
    );
    expect(result.allowed).toBe(true);
  });
});
