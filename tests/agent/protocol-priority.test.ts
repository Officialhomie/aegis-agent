/**
 * Protocol prioritization tests (mocked reserve state).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReserveState } from '../../src/lib/agent/state/reserve-state';

const mockGetReserveState = vi.fn();

vi.mock('../../src/lib/agent/state/reserve-state', async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    getReserveState: () => mockGetReserveState(),
  };
});

describe('Protocol Priority', () => {
  beforeEach(() => {
    mockGetReserveState.mockReset();
  });

  it('prioritizeOpportunities sorts by budget days and cost', async () => {
    mockGetReserveState.mockResolvedValue({
      protocolBudgets: [
        { protocolId: 'proto-a', balanceUSD: 100, totalSpent: 0, burnRateUSDPerDay: 5, estimatedDaysRemaining: 20 },
        { protocolId: 'proto-b', balanceUSD: 30, totalSpent: 0, burnRateUSDPerDay: 5, estimatedDaysRemaining: 6 },
      ],
    } as ReserveState);

    const { prioritizeOpportunities } = await import('../../src/lib/agent/execute/protocol-priority');
    const opportunities = [
      { protocolId: 'proto-b', userAddress: '0xbb' },
      { protocolId: 'proto-a', userAddress: '0xaa', estimatedCostUSD: 0.05, isNewWallet: true },
    ];
    const result = await prioritizeOpportunities(opportunities);
    expect(result).toHaveLength(2);
    expect(result[0].protocolId).toBe('proto-a');
    expect(result[0].priorityScore).toBeGreaterThanOrEqual(result[1].priorityScore);
  });

  it('prioritizeOpportunities handles empty state', async () => {
    mockGetReserveState.mockResolvedValue(null);
    const { prioritizeOpportunities } = await import('../../src/lib/agent/execute/protocol-priority');
    const result = await prioritizeOpportunities([
      { protocolId: 'x', userAddress: '0x1' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].priorityScore).toBe(50);
  });
});
