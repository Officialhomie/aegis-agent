/**
 * Trigger a single agent cycle (manual override)
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '../../../../src/lib/auth/api-auth';
import { AgentCycleRequestSchema } from '../../../../src/lib/api/schemas';

export async function POST(request: Request) {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { runAgentCycle } = await import('../../../../src/lib/agent');
    const body = await request.json().catch(() => ({}));
    const parsed = AgentCycleRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const config = parsed.data;
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
