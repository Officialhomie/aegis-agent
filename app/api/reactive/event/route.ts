/**
 * Reactive Network webhook: receives event callbacks and triggers Aegis agent cycle.
 */

import { NextResponse } from 'next/server';

const REACTIVE_CALLBACK_SECRET = process.env.REACTIVE_CALLBACK_SECRET;

function verifyReactiveCallback(headers: Headers): boolean {
  if (!REACTIVE_CALLBACK_SECRET) return true;
  const sig = headers.get('x-reactive-signature') ?? headers.get('authorization');
  return sig === `Bearer ${REACTIVE_CALLBACK_SECRET}` || sig === REACTIVE_CALLBACK_SECRET;
}

export async function POST(request: Request) {
  try {
    if (!verifyReactiveCallback(request.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chainId, event, data } = body as { chainId?: number; event?: string; data?: unknown };

    const { runAgentCycle } = await import('../../../../src/lib/agent');
    await runAgentCycle({
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10000,
      executionMode: 'SIMULATION',
      triggerSource: 'reactive',
      eventData: { chainId, event, data },
    });

    return NextResponse.json({ ok: true, triggered: true });
  } catch (error) {
    console.error('[Reactive] Webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
