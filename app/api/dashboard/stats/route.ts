/**
 * Dashboard stats: sponsorships today, active protocols, reserve health.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [sponsorshipsToday, protocolCount, reserves] = await Promise.all([
      prisma.sponsorshipRecord.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.protocolSponsor.count(),
      getReserveHealth(),
    ]);

    return NextResponse.json({
      sponsorshipsToday,
      activeProtocols: protocolCount,
      reserveHealth: reserves,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load stats' },
      { status: 500 }
    );
  }
}

async function getReserveHealth(): Promise<{ ETH: number; USDC: number; healthy: boolean }> {
  try {
    const { getAgentWalletBalance } = await import('../../../../src/lib/agent/observe/sponsorship');
    const balances = await getAgentWalletBalance();
    const thresholdEth = Number(process.env.RESERVE_THRESHOLD_ETH ?? 0.1);
    return {
      ETH: balances.ETH,
      USDC: balances.USDC,
      healthy: balances.ETH >= thresholdEth,
    };
  } catch {
    return { ETH: 0, USDC: 0, healthy: false };
  }
}
