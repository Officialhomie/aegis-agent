/**
 * POST /api/v1/sponsorship/request
 *
 * Submits a sponsorship request into the queue for async processing.
 * Returns request ID for status polling via GET /api/agent/request-status/:id
 *
 * Auth: Bearer token (AEGIS_API_KEY)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { enqueueRequest } from '@/src/lib/agent/queue/sponsorship-queue';

const RequestSchema = z.object({
  agentWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid agent wallet address'),
  protocolId: z.string().min(1, 'protocolId required'),
  estimatedCostUSD: z.number().min(0).default(0.01),
  targetContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  signature: z.string().optional(),
  maxGasLimit: z.number().int().positive().optional().default(200000),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { requestId, position } = await enqueueRequest({
      agentAddress: parsed.data.agentWallet,
      protocolId: parsed.data.protocolId,
      source: 'api',
      estimatedCostUSD: parsed.data.estimatedCostUSD,
      targetContract: parsed.data.targetContract,
      maxGasLimit: parsed.data.maxGasLimit,
      signature: parsed.data.signature,
    });

    return NextResponse.json({
      requestId,
      position,
      status: 'pending',
      statusUrl: `/api/agent/request-status/${requestId}`,
      message: 'Request queued for processing',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to queue sponsorship request' },
      { status: 500 }
    );
  }
}
