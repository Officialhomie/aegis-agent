/**
 * Sponsorship cycle Phase 1 optimizations - integration tests
 * Tests shouldPostSponsorshipProof counter, observation filter shortcut, savePreviousObservations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockHasSignificantChange = vi.hoisted(() => vi.fn());
const mockGetPreviousObservations = vi.hoisted(() => vi.fn());
const mockSavePreviousObservations = vi.hoisted(() => vi.fn());
const mockReasonAboutSponsorship = vi.hoisted(() => vi.fn());
const mockPostSponsorshipProof = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: vi.fn(),
  }),
}));

vi.mock('../../src/lib/agent/observe/observation-filter', () => ({
  hasSignificantChange: (...args: unknown[]) => mockHasSignificantChange(...args),
  getPreviousObservations: () => mockGetPreviousObservations(),
  savePreviousObservations: (obs: unknown) => mockSavePreviousObservations(obs),
}));

vi.mock('../../src/lib/agent/reason', () => ({
  reasonAboutSponsorship: (...args: unknown[]) => mockReasonAboutSponsorship(...args),
}));

vi.mock('../../src/lib/agent/social/farcaster', () => ({
  postSponsorshipProof: (...args: unknown[]) => mockPostSponsorshipProof(...args),
}));

vi.mock('../../src/lib/agent/observe', () => ({
  observeBaseSponsorshipOpportunities: vi.fn().mockResolvedValue([
    { id: '1', timestamp: new Date(), source: 'blockchain', data: { gasPriceGwei: '1' } },
  ]),
  observeGasPrice: vi.fn().mockResolvedValue([
    { id: 'g', timestamp: new Date(), source: 'blockchain', data: { gasPriceGwei: '1' } },
  ]),
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

vi.mock('../../src/lib/agent/policy', () => ({
  validatePolicy: vi.fn().mockResolvedValue({ passed: true, errors: [] }),
}));

vi.mock('../../src/lib/agent/execute/paymaster', () => ({
  signDecision: vi.fn().mockResolvedValue({
    decisionHash: '0xdec',
    decision: { action: 'SPONSOR_TRANSACTION', parameters: {} },
    signature: '0xsig',
  }),
  sponsorTransaction: vi.fn().mockResolvedValue({
    success: true,
    transactionHash: '0xtx',
    decisionHash: '0xdec',
  }),
}));

vi.mock('../../src/lib/agent/social/botchan', () => ({
  postSponsorshipToBotchan: vi.fn().mockResolvedValue(undefined),
  postReserveSwapToBotchan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/agent/execute', () => ({
  execute: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const COUNTER_KEY = 'sponsorship:farcaster:counter';

describe('sponsorship cycle optimizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPreviousObservations.mockResolvedValue([]);
    mockHasSignificantChange.mockResolvedValue(true);
    mockSavePreviousObservations.mockResolvedValue(undefined);
    mockPostSponsorshipProof.mockResolvedValue({ success: true });
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockReasonAboutSponsorship.mockResolvedValue({
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test',
      parameters: { agentWallet: '0x123', protocolId: 'p1', estimatedCostUSD: 0.5 },
      preconditions: [],
      expectedOutcome: '',
      metadata: {},
    });
  });

  it('when hasSignificantChange returns false, reasonAboutSponsorship is NOT called and decision is WAIT', async () => {
    mockHasSignificantChange.mockResolvedValue(false);

    const { runSponsorshipCycle } = await import('../../src/lib/agent/index');
    const state = await runSponsorshipCycle({
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    });

    expect(mockReasonAboutSponsorship).not.toHaveBeenCalled();
    expect(state.currentDecision).not.toBeNull();
    expect(state.currentDecision!.action).toBe('WAIT');
    expect(state.currentDecision!.reasoning).toContain('No significant changes');
    expect(mockSavePreviousObservations).toHaveBeenCalled();
  });

  it('when hasSignificantChange returns true, reasonAboutSponsorship IS called', async () => {
    const { runSponsorshipCycle } = await import('../../src/lib/agent/index');
    await runSponsorshipCycle({
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    });

    expect(mockReasonAboutSponsorship).toHaveBeenCalled();
    expect(mockSavePreviousObservations).toHaveBeenCalled();
  });

  it('savePreviousObservations is called at end of cycle when hasChanges', async () => {
    const { runSponsorshipCycle } = await import('../../src/lib/agent/index');
    await runSponsorshipCycle({
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    });

    expect(mockSavePreviousObservations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: '1', source: 'blockchain' }),
      ])
    );
  });

  it('shouldPostSponsorshipProof: post on 42nd (count 42), skip on 43rd', async () => {
    const { runSponsorshipCycle } = await import('../../src/lib/agent/index');

    mockGet.mockImplementation((key: string) => {
      if (key === COUNTER_KEY) return Promise.resolve('41');
      return Promise.resolve(null);
    });

    await runSponsorshipCycle({
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    });

    expect(mockPostSponsorshipProof).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(COUNTER_KEY, '42');

    mockPostSponsorshipProof.mockClear();
    mockSet.mockClear();
    mockGet.mockImplementation((key: string) => {
      if (key === COUNTER_KEY) return Promise.resolve('42');
      return Promise.resolve(null);
    });

    await runSponsorshipCycle({
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    });

    expect(mockPostSponsorshipProof).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(COUNTER_KEY, '43');
  });
});
