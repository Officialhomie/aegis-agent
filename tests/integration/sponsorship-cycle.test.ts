/**
 * Sponsorship cycle integration test (observe -> reason -> validate -> execute)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSponsorshipCycle } from '../../src/lib/agent';
import type { AgentConfig } from '../../src/lib/agent';

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  observeBaseSponsorshipOpportunities: vi.fn().mockResolvedValue([
    {
      id: 'gas-base-1',
      timestamp: new Date(),
      source: 'blockchain',
      chainId: 84532,
      data: { gasPriceGwei: '1.2', chainId: 84532 },
      context: 'Gas price',
    },
    {
      id: 'reserves-1',
      timestamp: new Date(),
      source: 'blockchain',
      chainId: 84532,
      data: { agentReservesETH: 0.5, agentReservesUSDC: 0, chainId: 84532 },
      context: 'Reserves',
    },
  ]),
  observeGasPrice: vi.fn().mockResolvedValue([
    { id: 'gas-1', timestamp: new Date(), source: 'blockchain', chainId: 84532, data: { gasPriceGwei: '1.2' }, context: '' },
  ]),
}));

vi.mock('../../src/lib/agent/reason', () => ({
  reasonAboutSponsorship: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.5,
    reasoning: 'No clear sponsorship opportunity.',
    parameters: null,
  }),
}));

vi.mock('../../src/lib/agent/execute/circuit-breaker', () => ({
  getDefaultCircuitBreaker: vi.fn().mockReturnValue({
    checkHealthBeforeExecution: vi.fn().mockResolvedValue({ healthy: true }),
  }),
}));

vi.mock('../../src/lib/agent/memory', () => ({
  retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
  storeMemory: vi.fn().mockResolvedValue(undefined),
}));

describe('runSponsorshipCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns state with observations and decision', async () => {
    const config: AgentConfig = {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    };
    const state = await runSponsorshipCycle(config);
    expect(state).toHaveProperty('observations');
    expect(Array.isArray(state.observations)).toBe(true);
    expect(state).toHaveProperty('currentDecision');
    expect(state.currentDecision).toHaveProperty('action');
    expect(state.currentDecision?.action).toBe('WAIT');
  });

  it('does not execute when decision is WAIT', async () => {
    const config: AgentConfig = {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    };
    const state = await runSponsorshipCycle(config);
    expect(state.executionResult).toBeNull();
  });
});
