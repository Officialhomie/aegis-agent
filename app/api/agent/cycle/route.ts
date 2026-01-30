/**
 * Trigger a single agent cycle (manual override)
 */

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { runAgentCycle } = await import('../../../../src/lib/agent');
    const body = await request.json().catch(() => ({}));
    const config = {
      confidenceThreshold: Number(body.confidenceThreshold ?? 0.75),
      maxTransactionValueUsd: Number(body.maxTransactionValueUsd ?? 10000),
      executionMode: (body.executionMode ?? 'SIMULATION') as 'LIVE' | 'SIMULATION' | 'READONLY',
    };
    const state = await runAgentCycle(config);
    return NextResponse.json({
      ok: true,
      state: {
        observationsCount: state.observations?.length ?? 0,
        currentDecision: state.currentDecision,
        hasExecutionResult: !!state.executionResult,
      },
    });
  } catch (error) {
    console.error('[API] Agent cycle error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cycle failed' },
      { status: 500 }
    );
  }
}
