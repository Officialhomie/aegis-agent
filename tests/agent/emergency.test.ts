/**
 * Emergency mode tests (mocked reserve state and Farcaster).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetReserveState = vi.fn();
const mockUpdateReserveState = vi.fn();
const mockPostToFarcaster = vi.fn();

vi.mock('../../src/lib/agent/state/reserve-state', () => ({
  getReserveState: (...args: unknown[]) => mockGetReserveState(...args),
  updateReserveState: (...args: unknown[]) => mockUpdateReserveState(...args),
}));

vi.mock('../../src/lib/agent/social/farcaster', () => ({
  postToFarcaster: (...args: unknown[]) => mockPostToFarcaster(...args),
}));

describe('Emergency Mode', () => {
  beforeEach(() => {
    mockGetReserveState.mockReset();
    mockUpdateReserveState.mockReset();
    mockPostToFarcaster.mockReset();
    mockPostToFarcaster.mockResolvedValue({ success: true });
  });

  it('returns false when no reserve state', async () => {
    mockGetReserveState.mockResolvedValue(null);
    const { checkAndUpdateEmergencyMode } = await import('../../src/lib/agent/emergency');
    const result = await checkAndUpdateEmergencyMode();
    expect(result).toBe(false);
    expect(mockUpdateReserveState).not.toHaveBeenCalled();
  });

  it('sets emergency and posts when eth below critical', async () => {
    mockGetReserveState
      .mockResolvedValueOnce({
        ethBalance: 0.01,
        criticalThresholdETH: 0.05,
        runwayDays: 2,
        forecastedRunwayDays: 2,
        healthScore: 10,
        emergencyMode: false,
      })
      .mockResolvedValueOnce({
        ethBalance: 0.01,
        criticalThresholdETH: 0.05,
        runwayDays: 2,
        emergencyMode: true,
      });
    mockUpdateReserveState.mockResolvedValue(undefined);
    const { checkAndUpdateEmergencyMode } = await import('../../src/lib/agent/emergency');
    const result = await checkAndUpdateEmergencyMode();
    expect(result).toBe(true);
    expect(mockUpdateReserveState).toHaveBeenCalledWith({ emergencyMode: true });
    expect(mockPostToFarcaster).toHaveBeenCalled();
  });

  it('does not update when already in emergency', async () => {
    mockGetReserveState.mockResolvedValue({
      ethBalance: 0.01,
      criticalThresholdETH: 0.05,
      runwayDays: 0.5,
      emergencyMode: true,
    });
    const { checkAndUpdateEmergencyMode } = await import('../../src/lib/agent/emergency');
    const result = await checkAndUpdateEmergencyMode();
    expect(result).toBe(true);
    expect(mockUpdateReserveState).not.toHaveBeenCalled();
  });
});
