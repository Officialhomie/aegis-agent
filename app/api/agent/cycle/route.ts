/**
 * Trigger a single agent cycle (manual override).
 * Query param format=bankr adds Bankr-compatible output when a decision is present.
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '../../../../src/lib/auth/api-auth';
import { AgentCycleRequestSchema } from '../../../../src/lib/api/schemas';
import { toBankrPrompt } from '../../../../src/lib/agent/execute';

export async function POST(request: Request) {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = request.url ? new URL(request.url) : null;
  const formatBankr = url?.searchParams?.get('format') === 'bankr';

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
    const response: {
      ok: boolean;
      state: {
        observationsCount: number;
        currentDecision: typeof state.currentDecision;
        hasExecutionResult: boolean;
      };
      bankrOutput?: ReturnType<typeof toBankrPrompt>;
    } = {
      ok: true,
      state: {
        observationsCount: state.observations?.length ?? 0,
        currentDecision: state.currentDecision,
        hasExecutionResult: !!state.executionResult,
      },
    };
    if (formatBankr && state.currentDecision) {
      response.bankrOutput = toBankrPrompt(state.currentDecision);
    }
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Agent cycle error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cycle failed' },
      { status: 500 }
    );
  }
}
