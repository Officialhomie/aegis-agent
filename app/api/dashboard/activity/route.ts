/**
 * Recent sponsorship activity (decision hashes).
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 100);

    const records = await prisma.sponsorshipRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userAddress: true,
        protocolId: true,
        decisionHash: true,
        estimatedCostUSD: true,
        actualCostUSD: true,
        txHash: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      activity: records,
      count: records.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load activity' },
      { status: 500 }
    );
  }
}
