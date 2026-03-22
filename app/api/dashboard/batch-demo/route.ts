/**
 * GET /api/dashboard/batch-demo
 *
 * Returns live aggregated stats for the batch demo run:
 *   - Total agents registered by archetype
 *   - Delegations active
 *   - UserOps submitted / succeeded / failed per archetype
 *   - Recent confirmed tx hashes
 *
 * Auth: Bearer AEGIS_API_KEY
 * Cache: no-store (live data, polled every 5s by dashboard)
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

const PROTOCOL_ID = 'aegis-batch-demo';

const ARCHETYPE_LABELS: Record<string, string> = {
  POWER: 'Power User',
  DEFI: 'DeFi Trader',
  NFT: 'NFT Collector',
  STANDARD: 'Standard User',
  CAUTIOUS: 'Cautious User',
};

const ARCHETYPE_ORDER = ['POWER', 'DEFI', 'NFT', 'STANDARD', 'CAUTIOUS'];

export async function GET() {
  const prisma = getPrisma();

  try {
    // 1. All approved agents for this protocol
    const agents = await prisma.approvedAgent.findMany({
      where: { protocolId: PROTOCOL_ID },
      select: { agentAddress: true, agentName: true },
    });

    if (agents.length === 0) {
      return NextResponse.json(
        {
          protocol: PROTOCOL_ID,
          agentsRegistered: 0,
          delegationsActive: 0,
          totalOpsSubmitted: 0,
          totalOpsSuccess: 0,
          totalOpsFailed: 0,
          successRate: 0,
          archetypes: [],
          recentTxHashes: [],
          lastUpdated: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Parse archetype from agentName: "Batch:POWER:#000" → "POWER"
    const agentAddressToArchetype = new Map<string, string>();
    for (const agent of agents) {
      const match = agent.agentName?.match(/^Batch:([A-Z]+):/);
      if (match) {
        agentAddressToArchetype.set(agent.agentAddress.toLowerCase(), match[1]);
      }
    }

    // 2. Delegations for these delegator addresses
    const delegatorAddresses = agents.map((a) => a.agentAddress.toLowerCase());
    const agentWallet = process.env.AGENT_WALLET_ADDRESS?.toLowerCase();

    const delegations = await prisma.delegation.findMany({
      where: {
        delegator: { in: delegatorAddresses },
        ...(agentWallet ? { agent: agentWallet } : {}),
      },
      select: { id: true, delegator: true, status: true },
    });

    const activeDelegations = delegations.filter((d) => d.status === 'ACTIVE');
    const delegationIds = delegations.map((d) => d.id);

    // Map delegationId → archetype
    const delegationToArchetype = new Map<string, string>();
    for (const del of delegations) {
      const arc = agentAddressToArchetype.get(del.delegator.toLowerCase());
      if (arc) delegationToArchetype.set(del.id, arc);
    }

    // 3. DelegationUsage for these delegation IDs
    const usages = delegationIds.length > 0
      ? await prisma.delegationUsage.findMany({
          where: { delegationId: { in: delegationIds } },
          select: {
            delegationId: true,
            success: true,
            txHash: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    // 4. Aggregate per archetype
    const archetypeStats = new Map<string, { agentCount: number; opsSubmitted: number; opsSuccess: number; opsFailed: number }>();
    for (const id of ARCHETYPE_ORDER) {
      archetypeStats.set(id, { agentCount: 0, opsSubmitted: 0, opsSuccess: 0, opsFailed: 0 });
    }

    // Count agents per archetype
    for (const [, arc] of agentAddressToArchetype) {
      const stats = archetypeStats.get(arc);
      if (stats) stats.agentCount++;
    }

    // Count ops per archetype
    for (const usage of usages) {
      const arc = delegationToArchetype.get(usage.delegationId);
      if (!arc) continue;
      const stats = archetypeStats.get(arc);
      if (!stats) continue;
      stats.opsSubmitted++;
      if (usage.success) stats.opsSuccess++;
      else stats.opsFailed++;
    }

    const totalOpsSubmitted = usages.length;
    const totalOpsSuccess = usages.filter((u) => u.success).length;
    const totalOpsFailed = totalOpsSubmitted - totalOpsSuccess;
    const successRate = totalOpsSubmitted > 0
      ? Math.round((totalOpsSuccess / totalOpsSubmitted) * 100)
      : 0;

    // Recent successful tx hashes (last 10)
    const recentTxHashes = usages
      .filter((u) => u.success && u.txHash)
      .slice(0, 10)
      .map((u) => u.txHash as string);

    const archetypesArray = ARCHETYPE_ORDER.map((id) => {
      const stats = archetypeStats.get(id) ?? { agentCount: 0, opsSubmitted: 0, opsSuccess: 0, opsFailed: 0 };
      return {
        id,
        label: ARCHETYPE_LABELS[id] ?? id,
        agentCount: stats.agentCount,
        opsSubmitted: stats.opsSubmitted,
        opsSuccess: stats.opsSuccess,
        opsFailed: stats.opsFailed,
      };
    });

    return NextResponse.json(
      {
        protocol: PROTOCOL_ID,
        agentsRegistered: agents.length,
        delegationsActive: activeDelegations.length,
        totalOpsSubmitted,
        totalOpsSuccess,
        totalOpsFailed,
        successRate,
        archetypes: archetypesArray,
        recentTxHashes,
        lastUpdated: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load batch demo stats' },
      { status: 500 }
    );
  }
}
