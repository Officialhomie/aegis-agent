/**
 * Register a new protocol sponsor (POST).
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { z } from 'zod';

const prisma = getPrisma();

const RegisterSchema = z.object({
  protocolId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(128),
  tier: z.enum(['bronze', 'silver', 'gold']).optional().default('bronze'),
  whitelistedContracts: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional().default([]),
  initialBalanceUSD: z.number().min(0).optional().default(0),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { protocolId, name, tier, whitelistedContracts, initialBalanceUSD } = parsed.data;

    const existing = await prisma.protocolSponsor.findUnique({ where: { protocolId } });
    if (existing) {
      return NextResponse.json({ error: 'Protocol already registered', protocolId }, { status: 409 });
    }

    const protocol = await prisma.protocolSponsor.create({
      data: {
        protocolId,
        name,
        tier,
        whitelistedContracts,
        balanceUSD: initialBalanceUSD,
      },
    });

    return NextResponse.json({
      protocolId: protocol.protocolId,
      name: protocol.name,
      tier: protocol.tier,
      balanceUSD: protocol.balanceUSD,
      createdAt: protocol.createdAt.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Registration failed' },
      { status: 500 }
    );
  }
}
