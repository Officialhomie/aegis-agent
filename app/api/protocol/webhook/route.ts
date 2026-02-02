/**
 * x402 payment callback: update protocol balance when facilitator confirms payment.
 * Expects body: { protocolId, amountUSD, paymentId?, signature? }.
 * Optional: verify X-PAYWITH-402 or API key for production.
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const WebhookSchema = z.object({
  protocolId: z.string().min(1),
  amountUSD: z.number().positive(),
  paymentId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = WebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid webhook payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { protocolId, amountUSD, paymentId } = parsed.data;

    const existing = await prisma.protocolSponsor.findUnique({ where: { protocolId } });
    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    const protocol = await prisma.protocolSponsor.update({
      where: { protocolId },
      data: { balanceUSD: { increment: amountUSD } },
    });

    return NextResponse.json({
      ok: true,
      protocolId: protocol.protocolId,
      balanceUSD: protocol.balanceUSD,
      creditedAmount: amountUSD,
      paymentId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Webhook failed' },
      { status: 500 }
    );
  }
}
