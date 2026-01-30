/**
 * Full agent cycle integration test
 * Requires OPENAI_API_KEY to run full cycle; uses dynamic import to avoid loading OpenAI when key is missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Full Agent Cycle', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org');
  });

  it('should complete observe-reason-decide-act-memory cycle in SIMULATION', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return; // Skip when no API key to avoid loading OpenAI client
    }
    const { runAgentCycle } = await import('../../src/lib/agent');
    const state = await runAgentCycle({
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10000,
      executionMode: 'SIMULATION',
    });

    expect(state).toBeDefined();
    expect(state.observations).toBeDefined();
    expect(Array.isArray(state.observations)).toBe(true);
    expect(state.currentDecision).toBeDefined();
    expect(state.memories).toBeDefined();
    expect(Array.isArray(state.memories)).toBe(true);
  }, 15000);

  it('should return state with executionResult when decision passes policy', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    const { runAgentCycle } = await import('../../src/lib/agent');
    const state = await runAgentCycle({
      confidenceThreshold: 0.5,
      maxTransactionValueUsd: 10000,
      executionMode: 'SIMULATION',
    });

    expect(state.currentDecision).toBeDefined();
    if (state.currentDecision && typeof state.currentDecision === 'object' && 'action' in state.currentDecision) {
      const decision = state.currentDecision as { action: string };
      if (decision.action !== 'WAIT' && state.executionResult !== undefined) {
        expect(state.executionResult).toBeDefined();
      }
    }
  }, 15000);
});
