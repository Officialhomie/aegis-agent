/**
 * Reactive Network webhook: receives event callbacks and triggers Aegis agent cycle.
 * HMAC-SHA256 signature verification required when REACTIVE_CALLBACK_SECRET is set.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { verifyApiAuth } from '../../../../src/lib/auth/api-auth';
import { ReactiveEventSchema } from '../../../../src/lib/api/schemas';

function verifyReactiveCallback(request: Request, body: string): boolean {
  const secret = process.env.REACTIVE_CALLBACK_SECRET;

  // CRITICAL: Deny all if secret not configured
  if (!secret) {
    console.error('[Reactive] REACTIVE_CALLBACK_SECRET not configured - denying request');
    return false;
  }

  const signature = request.headers.get('x-reactive-signature');
  if (!signature) {
    return false;
  }

  const expectedSig = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const bodyText = await request.text();

  if (!verifyReactiveCallback(request, bodyText)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = JSON.parse(bodyText) as unknown;
    const parsed = ReactiveEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { chainId, event, data } = parsed.data;

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
