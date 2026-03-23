import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps';
import { advanceOnboarding, getOnboardingState } from '@/src/lib/product/fsm/control-fsm';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

const STEP_VALUES = [...ONBOARDING_STEPS] as [string, ...string[]];

const PostSchema = z.object({
  sessionId: z.string().min(1),
  step: z.enum(STEP_VALUES),
  payload: z.record(z.any()).optional(),
});

export async function GET(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const state = await getOnboardingState(sessionId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, step, payload } = parsed.data;
  const next = await advanceOnboarding({
    sessionId,
    step: step as (typeof ONBOARDING_STEPS)[number],
    payload: (payload ?? {}) as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, ...next });
}
