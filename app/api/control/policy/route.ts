import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listPoliciesForSession, upsertUserPolicy } from '@/src/lib/product/services/user-policy-service';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

const PostSchema = z.object({
  sessionId: z.string().min(1),
  protocolId: z.string().min(1),
  commandName: z.string().min(1),
  dailyLimit: z.number().int().positive(),
  totalLimit: z.number().int().positive(),
  windowHours: z.number().int().positive().optional(),
  agentAddress: z.string().optional(),
});

export async function GET(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const policies = await listPoliciesForSession(sessionId);
  return NextResponse.json({ ok: true, policies });
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
  try {
    const policy = await upsertUserPolicy(parsed.data);
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
