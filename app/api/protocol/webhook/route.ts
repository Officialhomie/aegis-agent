/**
 * x402 Payment Webhook
 *
 * Updates protocol balance when facilitator confirms payment.
 * SECURED with HMAC signature verification and rate limiting.
 *
 * Required Headers:
 * - X-Aegis-Signature: HMAC-SHA256 signature of timestamp.body
 * - X-Aegis-Timestamp: Unix timestamp in seconds
 *
 * Request Body:
 * - protocolId: Protocol identifier
 * - amountUSD: Amount to credit
 * - paymentId: Optional payment reference
 * - txHash: Optional on-chain transaction hash
 *
 * Environment:
 * - PROTOCOL_WEBHOOK_SECRET: Secret for HMAC verification (required in production)
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { z } from 'zod';
import {
  verifyWebhookSignature,
  checkWebhookRateLimit,
} from '@/src/lib/auth/webhook-auth';
import { logger } from '@/src/lib/logger';

const prisma = getPrisma();

const WebhookSchema = z.object({
  protocolId: z.string().min(1),
  amountUSD: z.number().positive(),
  paymentId: z.string().optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  metadata: z.record(z.unknown()).optional(),
});

interface WebhookLogEntry {
  timestamp: string;
  protocolId: string;
  amountUSD: number;
  paymentId?: string;
  txHash?: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  error?: string;
}

/**
 * Log webhook request for audit trail.
 */
function logWebhookRequest(entry: WebhookLogEntry): void {
  if (entry.success) {
    logger.info('[Webhook] Payment credited', {
      protocolId: entry.protocolId,
      amountUSD: entry.amountUSD,
      paymentId: entry.paymentId,
      txHash: entry.txHash?.slice(0, 18) + '...',
    });
  } else {
    logger.warn('[Webhook] Request failed', {
      protocolId: entry.protocolId,
      error: entry.error,
      ip: entry.ip,
    });
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  const userAgent = request.headers.get('user-agent');

  let body: unknown;
  let protocolId = 'unknown';

  try {
    // Parse body first
    body = await request.json().catch(() => ({}));

    // Validate payload schema
    const parsed = WebhookSchema.safeParse(body);
    if (!parsed.success) {
      logWebhookRequest({
        timestamp: new Date().toISOString(),
        protocolId,
        amountUSD: 0,
        ip,
        userAgent,
        success: false,
        error: 'Invalid payload schema',
      });

      return NextResponse.json(
        { error: 'Invalid webhook payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    protocolId = parsed.data.protocolId;
    const { amountUSD, paymentId, txHash } = parsed.data;

    // Verify HMAC signature
    const signature = request.headers.get('x-aegis-signature');
    const timestamp = request.headers.get('x-aegis-timestamp');

    const authResult = verifyWebhookSignature(body, signature, timestamp);
    if (!authResult.valid) {
      logWebhookRequest({
        timestamp: new Date().toISOString(),
        protocolId,
        amountUSD,
        paymentId,
        ip,
        userAgent,
        success: false,
        error: `Auth failed: ${authResult.error}`,
      });

      return NextResponse.json(
        { error: 'Unauthorized', details: authResult.error },
        { status: 401 }
      );
    }

    // Check rate limit
    const rateLimit = checkWebhookRateLimit(protocolId);
    if (!rateLimit.allowed) {
      logWebhookRequest({
        timestamp: new Date().toISOString(),
        protocolId,
        amountUSD,
        paymentId,
        ip,
        userAgent,
        success: false,
        error: rateLimit.error,
      });

      return NextResponse.json(
        { error: 'Rate limit exceeded', details: rateLimit.error },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.resetAt.toString(),
            'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Verify protocol exists
    const existing = await prisma.protocolSponsor.findUnique({ where: { protocolId } });
    if (!existing) {
      logWebhookRequest({
        timestamp: new Date().toISOString(),
        protocolId,
        amountUSD,
        paymentId,
        ip,
        userAgent,
        success: false,
        error: 'Protocol not found',
      });

      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    // Check for duplicate payment (idempotency)
    if (paymentId) {
      const existingPayment = await prisma.paymentRecord.findFirst({
        where: { paymentHash: paymentId },
      });

      if (existingPayment) {
        logger.info('[Webhook] Duplicate payment, returning existing result', {
          protocolId,
          paymentId,
        });

        return NextResponse.json({
          ok: true,
          protocolId,
          balanceUSD: existing.balanceUSD,
          creditedAmount: 0,
          paymentId,
          duplicate: true,
          message: 'Payment already processed',
        });
      }
    }

    // Credit the protocol balance
    const protocol = await prisma.protocolSponsor.update({
      where: { protocolId },
      data: { balanceUSD: { increment: amountUSD } },
    });

    // Record payment for idempotency and audit
    if (paymentId) {
      await prisma.paymentRecord.create({
        data: {
          paymentHash: paymentId,
          amount: BigInt(Math.round(amountUSD * 1_000_000)), // Convert to 6 decimals
          currency: 'USDC',
          chainId: 8453, // Base
          requestedAction: 'webhook_credit',
          requester: ip ?? 'unknown',
          status: 'CONFIRMED',
          executionId: txHash ?? undefined,
        },
      });
    }

    const latencyMs = Date.now() - startTime;

    logWebhookRequest({
      timestamp: new Date().toISOString(),
      protocolId,
      amountUSD,
      paymentId,
      txHash,
      ip,
      userAgent,
      success: true,
    });

    return NextResponse.json(
      {
        ok: true,
        protocolId: protocol.protocolId,
        balanceUSD: protocol.balanceUSD,
        creditedAmount: amountUSD,
        paymentId,
        txHash,
        latencyMs,
      },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        },
      }
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Webhook failed';

    logWebhookRequest({
      timestamp: new Date().toISOString(),
      protocolId,
      amountUSD: 0,
      ip,
      userAgent,
      success: false,
      error: errorMessage,
    });

    logger.error('[Webhook] Internal error', {
      error: errorMessage,
      protocolId,
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to verify webhook configuration.
 * Returns whether webhook authentication is properly configured.
 */
export async function GET() {
  const hasSecret = !!process.env.PROTOCOL_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  return NextResponse.json({
    configured: hasSecret,
    authRequired: isProduction || hasSecret,
    headers: {
      signature: 'X-Aegis-Signature',
      timestamp: 'X-Aegis-Timestamp',
    },
    rateLimit: {
      maxRequests: 10,
      windowSeconds: 60,
    },
    signatureFormat: 'HMAC-SHA256(timestamp + "." + JSON.stringify(body))',
  });
}
