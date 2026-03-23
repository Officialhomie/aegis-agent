import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { createOpenClawSession } from '@/src/lib/agent/openclaw/session-manager';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

const BodySchema = z.object({
  sessionId: z.string().min(1),
  protocolId: z.string().min(1),
});

function hashToken(token: string): string {
  return createHash('sha256').update(`aeg-control:${token}`).digest('hex').slice(0, 32);
}

/**
 * Bind an OpenClaw session to a protocol so executeCommand can resolve protocolId.
 */
export async function POST(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const auth = request.headers.get('authorization') ?? '';
  const [, token] = auth.split(' ');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, protocolId } = parsed.data;
  const apiKeyHash = token ? hashToken(token) : 'dev';
  await createOpenClawSession(sessionId, protocolId, apiKeyHash);
  return NextResponse.json({ ok: true, sessionId, protocolId });
}
