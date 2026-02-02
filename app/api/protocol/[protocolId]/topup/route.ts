/**
 * Top-up protocol budget (POST).
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const TopupSchema = z.object({
  amountUSD: z.number().positive(),
  reference: z.string().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = TopupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.protocolSponsor.findUnique({ where: { protocolId } });
    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    const protocol = await prisma.protocolSponsor.update({
      where: { protocolId },
      data: { balanceUSD: { increment: parsed.data.amountUSD } },
    });

    return NextResponse.json({
      protocolId: protocol.protocolId,
      balanceUSD: protocol.balanceUSD,
      topupAmount: parsed.data.amountUSD,
      reference: parsed.data.reference,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Top-up failed' },
      { status: 500 }
    );
  }
}
