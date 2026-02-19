/**
 * OrchestratorService unit tests.
 *
 * Verifies that the service correctly:
 * - Calls observe, retrieve memories, and reason in order
 * - Returns a well-formed TaskSpec
 * - Returns null when observations are empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorService } from '../../../src/lib/orchestrator';

// Mock all dependencies to avoid touching real infrastructure
vi.mock('../../../src/lib/agent/memory', () => ({
  retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/lib/agent/observe', () => ({
  observeGasPrice: vi.fn().mockResolvedValue([
    { data: { gasPriceGwei: '1.5' } },
  ]),
}));

vi.mock('../../../src/lib/agent/modes/gas-sponsorship', () => ({
  getAdaptiveGasSponsorshipConfig: vi.fn().mockResolvedValue({
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'SIMULATION',
    gasPriceMaxGwei: 2,
  }),
}));

vi.mock('../../../src/lib/agent/modes/reserve-pipeline', () => ({
  getReservePipelineConfig: vi.fn().mockReturnValue({
    confidenceThreshold: 0.85,
    maxTransactionValueUsd: 500,
    executionMode: 'SIMULATION',
  }),
}));

const mockDecision = {
  action: 'WAIT' as const,
  confidence: 0.9,
  reasoning: 'Nothing to do right now',
  parameters: null,
  metadata: {},
};

const mockObservation = {
  id: 'obs-1',
  timestamp: new Date(),
  source: 'blockchain' as const,
  data: { type: 'gas-price', gasPriceGwei: '1.5' },
};

function buildMockMode(overrides: { observations?: unknown[]; decision?: typeof mockDecision } = {}) {
  return {
    id: 'gas-sponsorship',
    name: 'Gas Sponsorship',
    config: {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION' as const,
    },
    observe: vi.fn().mockResolvedValue(overrides.observations ?? [mockObservation]),
    reason: vi.fn().mockResolvedValue(overrides.decision ?? mockDecision),
  };
}

describe('OrchestratorService', () => {
  let svc: OrchestratorService;

  beforeEach(() => {
    svc = new OrchestratorService();
    vi.clearAllMocks();
  });

  it('returns a TaskSpec when observations are present', async () => {
    const mode = buildMockMode();
    const ctx = { mode, config: mode.config };

    const spec = await svc.orchestrate(ctx);

    expect(spec).not.toBeNull();
    expect(spec?.modeId).toBe('gas-sponsorship');
    expect(spec?.decision.action).toBe('WAIT');
    expect(spec?.decision.confidence).toBe(0.9);
    expect(spec?.observations).toHaveLength(1);
    expect(spec?.createdAt).toBeInstanceOf(Date);
  });

  it('returns null when observations are empty', async () => {
    const mode = buildMockMode({ observations: [] });
    const ctx = { mode, config: mode.config };

    const spec = await svc.orchestrate(ctx);

    expect(spec).toBeNull();
    expect(mode.reason).not.toHaveBeenCalled();
  });

  it('calls observe, then reason, in correct order', async () => {
    const callOrder: string[] = [];
    const mode = {
      ...buildMockMode(),
      observe: vi.fn().mockImplementation(async () => {
        callOrder.push('observe');
        return [mockObservation];
      }),
      reason: vi.fn().mockImplementation(async () => {
        callOrder.push('reason');
        return mockDecision;
      }),
    };
    const ctx = { mode, config: mode.config };

    await svc.orchestrate(ctx);

    expect(callOrder).toEqual(['observe', 'reason']);
  });

  it('injects gas price into config for gas-sponsorship mode', async () => {
    const mode = buildMockMode();
    const ctx = { mode, config: mode.config };

    const spec = await svc.orchestrate(ctx);

    expect(spec?.config.currentGasPriceGwei).toBe(1.5);
  });

  it('TaskSpec id is unique across multiple calls', async () => {
    const mode = buildMockMode();
    const ctx = { mode, config: mode.config };

    const spec1 = await svc.orchestrate(ctx);
    const spec2 = await svc.orchestrate(ctx);

    expect(spec1?.id).not.toBe(spec2?.id);
  });
});
