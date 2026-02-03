/**
 * List protocol sponsors (GET).
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const protocols = await prisma.protocolSponsor.findMany({
      orderBy: { protocolId: 'asc' },
      select: {
        protocolId: true,
        name: true,
        balanceUSD: true,
        totalSpent: true,
        sponsorshipCount: true,
        tier: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ protocols, count: protocols.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list protocols' },
      { status: 500 }
    );
  }
}
