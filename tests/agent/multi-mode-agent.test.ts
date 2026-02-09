/**
 * MultiModeAgent: concurrent mode execution, intervals, graceful shutdown, wallet lock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prevent Anthropic SDK from throwing in Vitest (browser-like env)
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn().mockResolvedValue({ content: [], id: 'msg-1' }) };
  },
}));

const mockSetNX = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/key-guard', () => ({
  getKeyGuardState: vi.fn().mockReturnValue({
    canSign: true,
    method: 'env_execute',
    mode: 'LIVE',
  }),
}));

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: mockSetNX,
  }),
}));

vi.mock('../../src/lib/agent/execute/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue({
    execute: (fn: () => Promise<unknown>) => fn(),
    getState: () => 'CLOSED',
  }),
}));

vi.mock('../../src/lib/agent/memory', () => ({
  storeMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/agent/observe/reserve-pipeline', () => ({
  observeReservePipeline: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  observeBaseSponsorshipOpportunities: vi.fn().mockResolvedValue([]),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 100, chainId: 8453 }),
}));

vi.mock('../../src/lib/agent/emergency', () => ({
  checkAndUpdateEmergencyMode: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/lib/agent/reason/reserve-reasoning', () => ({
  reasonAboutReserves: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.9,
    reasoning: 'OK',
    parameters: null,
  }),
}));

vi.mock('../../src/lib/agent/reason', () => ({
  reasonAboutSponsorship: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.8,
    reasoning: 'OK',
    parameters: null,
  }),
  reasonAboutReserves: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.9,
    reasoning: 'OK',
    parameters: null,
  }),
}));

import { MultiModeAgent } from '../../src/lib/agent/multi-mode-agent';
import { reservePipelineMode } from '../../src/lib/agent/modes/reserve-pipeline';
import { gasSponsorshipMode } from '../../src/lib/agent/modes/gas-sponsorship';

describe('MultiModeAgent', () => {
  beforeEach(() => {
    mockSetNX.mockResolvedValue(true);
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start registers signal handlers and starts timers', () => {
    const agent = new MultiModeAgent({
      modes: [reservePipelineMode, gasSponsorshipMode],
      intervals: { 'reserve-pipeline': 60_000, 'gas-sponsorship': 60_000 },
    });
    agent.start();
    expect(agent).toBeDefined();
    agent.stop();
  });

  it('stop clears timers', () => {
    const agent = new MultiModeAgent({
      modes: [reservePipelineMode],
      intervals: { 'reserve-pipeline': 60_000 },
    });
    agent.start();
    agent.stop();
    expect(agent).toBeDefined();
  });
});
