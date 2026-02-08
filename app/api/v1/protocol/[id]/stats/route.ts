/**
 * GET /api/v1/protocol/:id/stats
 *
 * Aggregates protocol data: budget, agents, and activity (24h, 7d).
 * Wires into getProtocolBudget, Prisma aggregates.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { getProtocolBudget } from '@/src/lib/agent/observe/sponsorship';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id: protocolId } = await context.params;

    const [protocol, budget, agentCounts, activity24h, activity7d] = await Promise.all([
      prisma.protocolSponsor.findUnique({ where: { protocolId } }),
      getProtocolBudget(protocolId),
      prisma.approvedAgent.count({
        where: { protocolId },
      }).then(async (total) => {
        const active = await prisma.approvedAgent.count({
          where: { protocolId, isActive: true },
        });
        return { total, active };
      }),
      getActivityForProtocol(protocolId, 24),
      getActivityForProtocol(protocolId, 24 * 7),
    ]);

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    const budgetData = budget ?? {
      protocolId,
      balanceUSD: protocol.balanceUSD,
      totalSpent: protocol.totalSpent,
    };

    return NextResponse.json({
      protocolId: protocol.protocolId,
      name: protocol.name,
      tier: protocol.tier,
      budget: {
        balanceUSD: budgetData.balanceUSD,
        totalSpent: budgetData.totalSpent,
        sponsorshipCount: protocol.sponsorshipCount,
      },
      agents: {
        total: agentCounts.total,
        active: agentCounts.active,
      },
      activity: {
        last24h: activity24h,
        last7d: activity7d,
      },
      whitelistedContracts: protocol.whitelistedContracts,
      createdAt: protocol.createdAt.toISOString(),
      updatedAt: protocol.updatedAt.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to get protocol stats' },
      { status: 500 }
    );
  }
}

async function getActivityForProtocol(
  protocolId: string,
  hoursBack: number
): Promise<{ sponsorships: number; totalCostUSD: number; uniqueUsers: number }> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const records = await prisma.sponsorshipRecord.findMany({
    where: {
      protocolId,
      createdAt: { gte: since },
      txHash: { not: null },
    },
    select: {
      userAddress: true,
      estimatedCostUSD: true,
      actualCostUSD: true,
    },
  });

  const uniqueUsers = new Set(records.map((r) => r.userAddress.toLowerCase())).size;
  const totalCostUSD = records.reduce(
    (sum, r) => sum + (r.actualCostUSD ?? r.estimatedCostUSD ?? 0),
    0
  );

  return {
    sponsorships: records.length,
    totalCostUSD,
    uniqueUsers,
  };
}
