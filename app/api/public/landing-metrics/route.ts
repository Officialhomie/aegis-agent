/**
 * Public aggregates for the marketing site: protocols, agents, delegations,
 * sponsorship records, and chain-scoped mainnet activity (deposits + executions).
 *
 * Chain filter: AEGIS_PUBLIC_MAINNET_CHAIN_IDS (default "8453" = Base mainnet).
 * SponsorshipRecord has no chainId in schema; those counts are deployment-wide.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

function parseMainnetChainIds(): number[] {
  const raw = process.env.AEGIS_PUBLIC_MAINNET_CHAIN_IDS ?? '8453';
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function chainLabel(ids: number[]): string {
  if (ids.length === 1 && ids[0] === 8453) return 'Base Mainnet';
  if (ids.length === 1 && ids[0] === 84532) return 'Base Sepolia';
  return ids.join(', ');
}

export async function GET() {
  try {
    const chainIds = parseMainnetChainIds();
    const label = chainLabel(chainIds);

    const [
      liveProtocols,
      registeredProtocols,
      approvedAgents,
      activeDelegations,
      sponsorshipsWithTxHash,
      mainnetConfirmedDeposits,
      mainnetSuccessfulExecutions,
      delegationUsageSuccessWithTx,
      featuredProtocol,
      latestMainnetDeposit,
    ] = await Promise.all([
      prisma.protocolSponsor.count({
        where: { onboardingStatus: 'LIVE' },
      }),
      prisma.protocolSponsor.count(),
      prisma.approvedAgent.count({ where: { isActive: true } }),
      prisma.delegation.count({ where: { status: 'ACTIVE' } }),
      prisma.sponsorshipRecord.count({
        where: { txHash: { not: null } },
      }),
      prisma.depositTransaction.count({
        where: { confirmed: true, chainId: { in: chainIds } },
      }),
      prisma.execution.count({
        where: {
          success: true,
          txHash: { not: null },
          chainId: { in: chainIds },
        },
      }),
      prisma.delegationUsage.count({
        where: { success: true, txHash: { not: null } },
      }),
      prisma.protocolSponsor.findFirst({
        orderBy: [{ sponsorshipCount: 'desc' }, { updatedAt: 'desc' }],
        select: {
          protocolId: true,
          name: true,
          tier: true,
          balanceUSD: true,
          sponsorshipCount: true,
          whitelistedContracts: true,
        },
      }),
      prisma.depositTransaction.findFirst({
        where: { confirmed: true, chainId: { in: chainIds } },
        orderBy: { confirmedAt: 'desc' },
        select: { txHash: true, chainId: true },
      }),
    ]);

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        chainFilter: { ids: chainIds, label },
        totals: {
          liveProtocols,
          registeredProtocols,
          approvedAgents,
          activeDelegations,
          sponsorshipsWithTxHash,
          mainnetConfirmedDeposits,
          mainnetSuccessfulExecutions,
          delegationUsageSuccessWithTx,
        },
        featuredProtocol: featuredProtocol
          ? {
              protocolId: featuredProtocol.protocolId,
              name: featuredProtocol.name,
              tier: featuredProtocol.tier,
              balanceUSD: featuredProtocol.balanceUSD,
              sponsorshipCount: featuredProtocol.sponsorshipCount,
              whitelistedContracts: featuredProtocol.whitelistedContracts.slice(0, 4),
            }
          : null,
        latestMainnetDepositTx: latestMainnetDeposit?.txHash
          ? {
              txHash: latestMainnetDeposit.txHash,
              chainId: latestMainnetDeposit.chainId,
            }
          : null,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load landing metrics' },
      { status: 500 }
    );
  }
}
