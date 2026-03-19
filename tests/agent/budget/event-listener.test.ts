/**
 * Event listener unit tests (handlePostOpEvent, start/stop)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handlePostOpEvent,
  startPostOpEventListener,
  stopPostOpEventListener,
} from '../../../src/lib/agent/budget/event-listener';

const mockCommitReservation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('../../../src/lib/agent/budget/agent-budget-service', () => ({
  commitReservation: (...args: unknown[]) => mockCommitReservation(...args),
}));

vi.mock('../../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    agentSpendLedger: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
  }),
}));

vi.mock('../../../src/lib/agent/observe/oracles', () => ({
  getEthPriceUSD: vi.fn().mockResolvedValue(2500),
}));

describe('handlePostOpEvent', () => {
  const event = {
    sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
    userOpHash: '0x' + 'a'.repeat(64) as `0x${string}`,
    agentTier: 2,
    actualGasCost: BigInt(100000 * 1e9), // 100k gas at 1 gwei
    transactionHash: '0x' + 'b'.repeat(64) as `0x${string}`,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds RESERVED ledger by userOpHash and calls commitReservation', async () => {
    mockFindFirst.mockResolvedValue({ reservationId: 'res-123' });

    await handlePostOpEvent(event);

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userOpHash: event.userOpHash, status: 'RESERVED' },
      select: { reservationId: true },
    });
    expect(mockCommitReservation).toHaveBeenCalledWith('res-123', {
      amountUSD: expect.any(Number),
      userOpHash: event.userOpHash,
      txHash: event.transactionHash,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates COMMITTED row when no reservation found (fallback path)', async () => {
    mockFindFirst.mockResolvedValue(null);

    await handlePostOpEvent(event);

    expect(mockCommitReservation).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentAddress: event.sender.toLowerCase(),
        status: 'COMMITTED',
        userOpHash: event.userOpHash,
        txHash: event.transactionHash,
        actualUSD: expect.any(Number),
      }),
    });
  });
});

describe('startPostOpEventListener / stopPostOpEventListener', () => {
  it('startPostOpEventListener returns early when AEGIS_PAYMASTER_ADDRESS not set', async () => {
    const orig = process.env.AEGIS_PAYMASTER_ADDRESS;
    delete process.env.AEGIS_PAYMASTER_ADDRESS;
    await startPostOpEventListener();
    process.env.AEGIS_PAYMASTER_ADDRESS = orig;
    // No error - returns early without starting watcher
  });

  it('stopPostOpEventListener can be called without throwing', () => {
    expect(() => stopPostOpEventListener()).not.toThrow();
  });
});
