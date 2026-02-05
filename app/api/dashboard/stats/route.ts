/**
 * Dashboard stats: sponsorships today, active protocols, reserve health (multi-chain).
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

interface ChainBalance {
  chainId: number;
  chainName: string;
  ETH: number;
  USDC: number;
}

async function getReserveHealth(): Promise<{
  ETH: number;
  USDC: number;
  healthy: boolean;
  balances: ChainBalance[];
}> {
  try {
    const { getAgentWalletBalances } = await import('../../../../src/lib/agent/observe/sponsorship');
    const balances = await getAgentWalletBalances();
    const thresholdEth = Number(process.env.RESERVE_THRESHOLD_ETH ?? 0.1);
    const first = balances[0];
    const eth = first?.ETH ?? 0;
    const usdc = first?.USDC ?? 0;
    return {
      ETH: eth,
      USDC: usdc,
      healthy: eth >= thresholdEth,
      balances: balances.map((b) => ({
        chainId: b.chainId,
        chainName: b.chainName,
        ETH: b.ETH,
        USDC: b.USDC,
      })),
    };
  } catch {
    return { ETH: 0, USDC: 0, healthy: false, balances: [] };
  }
}
