/**
 * Reserve Pipeline mode: definition, onStart, observe/reason hooks.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/agent/observe/reserve-pipeline', () => ({
  observeReservePipeline: vi.fn().mockResolvedValue([{ id: 'obs-1', timestamp: new Date(), source: 'api', data: {} }]),
}));

vi.mock('../../../src/lib/agent/reason/reserve-reasoning', () => ({
  reasonAboutReserves: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.9,
    reasoning: 'OK',
    parameters: null,
  }),
}));

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({ get: mockGet, set: mockSet, setNX: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../../../src/lib/agent/observe/sponsorship', () => ({
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 200, chainId: 8453 }),
}));

import { reservePipelineMode } from '../../../src/lib/agent/modes/reserve-pipeline';

describe('Reserve Pipeline Mode', () => {
  it('has correct id and name', () => {
    expect(reservePipelineMode.id).toBe('reserve-pipeline');
    expect(reservePipelineMode.name).toBe('Reserve Pipeline');
  });

  it('observe returns array from observeReservePipeline', async () => {
    const obs = await reservePipelineMode.observe!();
    expect(Array.isArray(obs)).toBe(true);
  });

  it('onStart updates reserve state with wallet balance', async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    await reservePipelineMode.onStart!();
    expect(mockSet).toHaveBeenCalled();
  });
});
