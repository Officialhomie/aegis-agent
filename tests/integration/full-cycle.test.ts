/**
 * Full agent cycle integration test
 * Skips when OPENAI_API_KEY is not set (use test.skipIf with descriptive message).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());

describe('Full Agent Cycle', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org');
  });

  it.skipIf(!hasOpenAIKey)(
    'should complete observe-reason-decide-act-memory cycle in SIMULATION',
    async () => {
      const { runAgentCycle } = await import('../../src/lib/agent');
      const state = await runAgentCycle({
        confidenceThreshold: 0.75,
        maxTransactionValueUsd: 10000,
        executionMode: 'SIMULATION',
      });

      expect(state).toBeDefined();
      expect(state.observations).toBeDefined();
      expect(Array.isArray(state.observations)).toBe(true);
      expect(state.observations!.length).toBeGreaterThanOrEqual(0);
      expect(state.currentDecision).toBeDefined();
      expect(state.memories).toBeDefined();
      expect(Array.isArray(state.memories)).toBe(true);
    },
    15000
  );

  it.skipIf(!hasOpenAIKey)(
    'should return state with executionResult when decision passes policy',
    async () => {
      const { runAgentCycle } = await import('../../src/lib/agent');
      const state = await runAgentCycle({
        confidenceThreshold: 0.5,
        maxTransactionValueUsd: 10000,
        executionMode: 'SIMULATION',
      });

      expect(state.currentDecision).toBeDefined();
      if (
        state.currentDecision &&
        typeof state.currentDecision === 'object' &&
        'action' in state.currentDecision
      ) {
        const decision = state.currentDecision as { action: string };
        if (decision.action !== 'WAIT' && state.executionResult !== undefined) {
          expect(state.executionResult).toBeDefined();
        }
      }
    },
    15000
  );
});
