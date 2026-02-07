/**
 * Gas Sponsorship mode: adaptive throttling, reserve state checks, skip on emergency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetKeyGuardState = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/key-guard', () => ({
  getKeyGuardState: () => mockGetKeyGuardState(),
}));

const mockGet = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: vi.fn(),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  observeBaseSponsorshipOpportunities: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/lib/agent/reason', () => ({
  reasonAboutSponsorship: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.8,
    reasoning: 'OK',
    parameters: null,
  }),
}));

import { gasSponsorshipMode, getAdaptiveGasSponsorshipConfig } from '../../../src/lib/agent/modes/gas-sponsorship';

describe('Gas Sponsorship Mode', () => {
  beforeEach(() => {
    mockGetKeyGuardState.mockReturnValue({
      canSign: true,
      method: 'env_execute',
      mode: 'LIVE',
    });
  });

  it('getAdaptiveGasSponsorshipConfig returns 0.9 confidence when health < 50', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        healthScore: 45,
        emergencyMode: false,
        ethBalance: 0.1,
        usdcBalance: 100,
        chainId: 8453,
        lastUpdated: new Date().toISOString(),
      })
    );
    const config = await getAdaptiveGasSponsorshipConfig();
    expect(config.confidenceThreshold).toBe(0.9);
  });

  it('getAdaptiveGasSponsorshipConfig returns 0.8 when health >= 50', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        healthScore: 80,
        emergencyMode: false,
        ethBalance: 0.5,
        usdcBalance: 200,
        chainId: 8453,
        lastUpdated: new Date().toISOString(),
      })
    );
    const config = await getAdaptiveGasSponsorshipConfig();
    expect(config.confidenceThreshold).toBe(0.8);
  });

  it('observe returns empty when emergencyMode true', async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        healthScore: 50,
        emergencyMode: true,
        ethBalance: 0.05,
        usdcBalance: 50,
        chainId: 8453,
        lastUpdated: new Date().toISOString(),
      })
    );
    const obs = await gasSponsorshipMode.observe!();
    expect(obs).toEqual([]);
  });

  it('getAdaptiveGasSponsorshipConfig forces SIMULATION when KeyGuard canSign is false', async () => {
    mockGetKeyGuardState.mockReturnValue({
      canSign: false,
      method: 'none',
      mode: 'SIMULATION',
    });
    mockGet.mockResolvedValue(
      JSON.stringify({
        healthScore: 80,
        emergencyMode: false,
        ethBalance: 0.5,
        usdcBalance: 200,
        chainId: 8453,
        lastUpdated: new Date().toISOString(),
      })
    );
    const config = await getAdaptiveGasSponsorshipConfig();
    expect(config.executionMode).toBe('SIMULATION');
    expect(config.confidenceThreshold).toBe(0.8);
  });
});
