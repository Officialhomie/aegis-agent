/**
 * DispatcherService unit tests.
 *
 * Verifies that the dispatcher correctly:
 * - Rejects tasks that fail policy validation
 * - Skips execution when confidence is below threshold
 * - Short-circuits in READONLY mode
 * - Routes to the correct executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatcherService } from '../../../src/lib/dispatcher';
import type { TaskSpec } from '../../../src/lib/orchestrator/types';

// Mock policy validation
vi.mock('../../../src/lib/agent/policy', () => ({
  validatePolicy: vi.fn().mockResolvedValue({ passed: true, errors: [], warnings: [] }),
}));

// Mock executor registry
vi.mock('../../../src/lib/executors', () => ({
  getExecutor: vi.fn().mockReturnValue({
    handles: ['WAIT'],
    execute: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

import { validatePolicy } from '../../../src/lib/agent/policy';
import { getExecutor } from '../../../src/lib/executors';

function buildSpec(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    id: 'task-test-1',
    modeId: 'gas-sponsorship',
    decision: {
      action: 'WAIT',
      confidence: 0.9,
      reasoning: 'Test decision',
      parameters: null,
      metadata: {},
    },
    config: {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    },
    observations: [],
    memories: [],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DispatcherService', () => {
  let dispatcher: DispatcherService;

  beforeEach(() => {
    dispatcher = new DispatcherService();
    vi.clearAllMocks();
    // Reset mocks to passing defaults
    vi.mocked(validatePolicy).mockResolvedValue({ passed: true, errors: [], warnings: [], appliedRules: [] });
    vi.mocked(getExecutor).mockReturnValue({
      handles: ['WAIT'],
      execute: vi.fn().mockResolvedValue({ success: true }),
    });
  });

  it('returns policyPassed=false and skips execution when policy fails', async () => {
    vi.mocked(validatePolicy).mockResolvedValue({
      passed: false,
      errors: ['Budget exceeded'],
      warnings: [],
      appliedRules: [],
    });

    const spec = buildSpec();
    const result = await dispatcher.dispatch(spec);

    expect(result.policyPassed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('POLICY');
    expect(result.policyErrors).toContain('Budget exceeded');
    expect(getExecutor).not.toHaveBeenCalled();
  });

  it('skips execution when confidence is below threshold', async () => {
    const spec = buildSpec({
      decision: {
        action: 'SPONSOR_TRANSACTION',
        confidence: 0.5,
        reasoning: 'Low confidence',
        parameters: null,
        metadata: {},
      },
      config: {
        confidenceThreshold: 0.8,
        maxTransactionValueUsd: 100,
        executionMode: 'SIMULATION',
      },
    });

    const result = await dispatcher.dispatch(spec);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('CONFIDENCE');
    expect(getExecutor).not.toHaveBeenCalled();
  });

  it('skips execution in READONLY mode', async () => {
    const spec = buildSpec({
      config: {
        confidenceThreshold: 0.8,
        maxTransactionValueUsd: 100,
        executionMode: 'READONLY',
      },
    });

    const result = await dispatcher.dispatch(spec);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('READONLY');
    expect(getExecutor).not.toHaveBeenCalled();
  });

  it('calls executor and returns result when all checks pass', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true, simulationResult: 'ok' });
    vi.mocked(getExecutor).mockReturnValue({ handles: ['WAIT'], execute: mockExecute });

    const spec = buildSpec();
    const result = await dispatcher.dispatch(spec);

    expect(result.skipped).toBe(false);
    expect(result.policyPassed).toBe(true);
    expect(result.executionResult?.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(spec);
  });

  it('passes the spec unchanged to the executor', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getExecutor).mockReturnValue({ handles: ['WAIT'], execute: mockExecute });

    const spec = buildSpec({ modeId: 'reserve-pipeline' });
    await dispatcher.dispatch(spec);

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ modeId: 'reserve-pipeline' }));
  });
});
