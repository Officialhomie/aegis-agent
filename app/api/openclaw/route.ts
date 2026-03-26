/**
 * OpenClaw HTTP endpoint.
 *
 * POST /api/openclaw — Receives commands from the user via OpenClaw messaging bridge.
 * GET  /api/openclaw — Returns capability manifest for OpenClaw discovery.
 *
 * Authentication: Bearer token (AEGIS_API_KEY), same as all other Aegis API routes.
 *
 * Request body (POST):
 *   { command: string, sessionId: string, callbackUrl?: string }
 *
 * Response:
 *   { ok: true, acknowledged: true, response?: string, asyncPending?: boolean }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runOpenClawHttpCommand } from '@/src/lib/agent/openclaw/http-runner';

const OpenClawRequestSchema = z.object({
  command: z.string().min(1, 'command is required'),
  sessionId: z.string().min(1, 'sessionId is required'),
  callbackUrl: z.string().url().optional(),
  args: z.array(z.string()).optional(),
});

/** Verify Bearer token auth (same pattern as /api/agent/cycle, etc.) */
function verifyAuth(request: Request): boolean {
  const apiKey = process.env.AEGIS_API_KEY;
  if (!apiKey) {
    // Allow in development
    return process.env.NODE_ENV === 'development';
  }
  const auth = request.headers.get('authorization') ?? '';
  const [, token] = auth.split(' ');
  return token === apiKey;
}

export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = OpenClawRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { command, sessionId, callbackUrl } = parsed.data;

  let result: Awaited<ReturnType<typeof runOpenClawHttpCommand>>['result'];
  let asyncPending: boolean | undefined;
  try {
    ({ result, asyncPending } = await runOpenClawHttpCommand({
      command,
      sessionId,
      callbackUrl,
    }));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }

  if (asyncPending) {
    return NextResponse.json({
      ok: true,
      acknowledged: true,
      asyncPending: true,
      immediate: result.message,
    });
  }

  return NextResponse.json({
    ok: true,
    acknowledged: true,
    response: result.message,
    data: result.data,
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'aegis',
    version: '1.0.0',
    description: 'Autonomous Gas Sponsorship Agent for Base blockchain',
    protocol: 'openclaw-http/1.0',
    commands: ['status', 'cycle', 'sponsor', 'report', 'pause', 'resume', 'help', 'campaign', 'campaign_status'],
    endpoints: {
      command: 'POST /api/openclaw',
      manifest: 'GET /api/openclaw',
      aegControlExecute: 'POST /api/control/execute',
    },
  });
}
