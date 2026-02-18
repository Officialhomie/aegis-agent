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

  const { parseCommand, executeCommand } = await import(
    '../../../src/lib/agent/openclaw/command-handler'
  );
  const { appendActionLog } = await import('../../../src/lib/agent/openclaw/memory-manager');

  // Register callback URL for proactive reporting
  if (callbackUrl) {
    const { setLatestSession } = await import(
      '../../../src/lib/agent/openclaw/proactive-reporter'
    );
    await setLatestSession(sessionId, callbackUrl);
  }

  const cmd = parseCommand(command);

  // For async commands (cycle), acknowledge immediately and let the cycle
  // report back via callbackUrl when done.
  if (cmd.name === 'cycle' && callbackUrl) {
    const result = await executeCommand(cmd);
    await appendActionLog('USER_CMD', `cycle triggered from session ${sessionId}`);
    return NextResponse.json({
      ok: true,
      acknowledged: true,
      asyncPending: true,
      immediate: result.message,
    });
  }

  const result = await executeCommand(cmd);
  await appendActionLog(
    'USER_CMD',
    `[${sessionId}] ${command} -> ${result.message.slice(0, 100)}`
  );

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
    commands: ['status', 'cycle', 'sponsor', 'report', 'pause', 'resume', 'help'],
    endpoints: {
      command: 'POST /api/openclaw',
      manifest: 'GET /api/openclaw',
    },
  });
}
