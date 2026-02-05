/**
 * Botchan webhook: receives agent requests and triggers skill processing.
 * HMAC-SHA256 signature verification when BOTCHAN_WEBHOOK_SECRET is set.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Botchan webhook payload schema
 */
const BotchanWebhookSchema = z.object({
  type: z.enum(['post', 'mention', 'reply', 'request']),
  feed: z.string(),
  sender: z.string(),
  message: z.string(),
  timestamp: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type BotchanWebhookPayload = z.infer<typeof BotchanWebhookSchema>;

/**
 * Verify Botchan webhook signature
 */
function verifyBotchanSignature(request: Request, body: string): boolean {
  const secret = process.env.BOTCHAN_WEBHOOK_SECRET;

  // If no secret configured, allow in development only
  if (!secret) {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      console.warn('[Botchan] BOTCHAN_WEBHOOK_SECRET not set - allowing in development');
      return true;
    }
    console.error('[Botchan] BOTCHAN_WEBHOOK_SECRET not configured - denying request');
    return false;
  }

  const signature = request.headers.get('x-botchan-signature');
  if (!signature) {
    return false;
  }

  const expectedSig = createHmac('sha256', secret).update(body).digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Process a sponsorship request from Botchan
 */
async function processRequest(payload: BotchanWebhookPayload): Promise<{
  processed: boolean;
  approved?: boolean;
  reason?: string;
}> {
  const { executeSkill, getSkill } = await import('../../../../src/lib/agent/skills');

  const skill = getSkill('botchan-listener');
  if (!skill) {
    return { processed: false, reason: 'Botchan listener skill not registered' };
  }

  const result = await executeSkill(skill, {
    event: 'heartbeat:start',
    requestData: {
      type: payload.type,
      feed: payload.feed,
      sender: payload.sender,
      message: payload.message,
      timestamp: payload.timestamp,
    },
  });

  if (!result.success) {
    return { processed: false, reason: result.error };
  }

  const data = result.data as { approved?: number; rejected?: number } | undefined;
  return {
    processed: true,
    approved: (data?.approved ?? 0) > 0,
    reason: result.summary,
  };
}

export async function POST(request: Request) {
  const bodyText = await request.text();

  // Verify signature
  if (!verifyBotchanSignature(request, bodyText)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = JSON.parse(bodyText) as unknown;
    const parsed = BotchanWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // Log incoming webhook
    console.log('[Botchan] Webhook received', {
      type: payload.type,
      feed: payload.feed,
      sender: payload.sender.slice(0, 10) + '...',
    });

    // Process based on type
    if (payload.type === 'request' || payload.message.toLowerCase().includes('sponsor')) {
      const result = await processRequest(payload);
      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    // For other types, just acknowledge
    return NextResponse.json({
      ok: true,
      processed: false,
      reason: 'Event type not processed',
    });
  } catch (error) {
    console.error('[Botchan] Webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * Health check for webhook endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'botchan-webhook',
    configured: !!process.env.BOTCHAN_WEBHOOK_SECRET,
  });
}
