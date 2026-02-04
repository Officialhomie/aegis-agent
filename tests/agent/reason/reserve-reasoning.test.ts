/**
 * Reserve reasoning tests: reasonAboutReserves output validation.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/agent/reason/reserve-prompt', () => ({
  generateReserveDecision: vi.fn().mockResolvedValue({
    action: 'WAIT',
    confidence: 0.8,
    reasoning: 'Reserves healthy, no action needed.',
    parameters: null,
    metadata: undefined,
  }),
}));

import { reasonAboutReserves } from '../../../src/lib/agent/reason/reserve-reasoning';

describe('Reserve Reasoning', () => {
  it('reasonAboutReserves returns validated decision', async () => {
    const decision = await reasonAboutReserves([], []);
    expect(decision).toHaveProperty('action');
    expect(decision).toHaveProperty('confidence');
    expect(decision).toHaveProperty('reasoning');
    expect(['WAIT', 'REPLENISH_RESERVES', 'ALLOCATE_BUDGET', 'ALERT_LOW_RUNWAY', 'REBALANCE_RESERVES']).toContain(
      decision.action
    );
  });

  it('reasonAboutReserves returns WAIT on LLM failure', async () => {
    const { generateReserveDecision } = await import('../../../src/lib/agent/reason/reserve-prompt');
    vi.mocked(generateReserveDecision).mockRejectedValueOnce(new Error('LLM error'));
    const decision = await reasonAboutReserves([], []);
    expect(decision.action).toBe('WAIT');
    expect(decision.metadata?.reasoningFailed).toBe(true);
  });
});
