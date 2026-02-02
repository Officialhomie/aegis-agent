/**
 * Get (GET) or update (PATCH) a protocol sponsor.
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const UpdateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  tier: z.enum(['bronze', 'silver', 'gold']).optional(),
  whitelistedContracts: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
});

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  try {
    const { protocolId } = await context.params;
    const protocol = await prisma.protocolSponsor.findUnique({
      where: { protocolId },
    });
    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }
    return NextResponse.json({
      protocolId: protocol.protocolId,
      name: protocol.name,
      balanceUSD: protocol.balanceUSD,
      totalSpent: protocol.totalSpent,
      sponsorshipCount: protocol.sponsorshipCount,
      whitelistedContracts: protocol.whitelistedContracts,
      tier: protocol.tier,
      createdAt: protocol.createdAt.toISOString(),
      updatedAt: protocol.updatedAt.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to get protocol' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
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
      data: {
        ...(parsed.data.name != null && { name: parsed.data.name }),
        ...(parsed.data.tier != null && { tier: parsed.data.tier }),
        ...(parsed.data.whitelistedContracts != null && { whitelistedContracts: parsed.data.whitelistedContracts }),
      },
    });

    return NextResponse.json({
      protocolId: protocol.protocolId,
      name: protocol.name,
      tier: protocol.tier,
      balanceUSD: protocol.balanceUSD,
      updatedAt: protocol.updatedAt.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Update failed' },
      { status: 500 }
    );
  }
}
