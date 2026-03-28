/**
 * GET /api/dashboard/verifiable-metrics
 *
 * Row counts from PostgreSQL only — auditable, no in-process estimates.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      sponsorshipRecordsTotal,
      sponsorshipRecordsLast24h,
      sponsorshipRecordsWithTxHash,
      delegationsActive,
      delegationsTotal,
      delegationsWithMdf,
      delegationUsageLast24h,
      delegationUsageSuccessLast24h,
      approvedAgentsActive,
      protocolsRegistered,
    ] = await Promise.all([
      prisma.sponsorshipRecord.count(),
      prisma.sponsorshipRecord.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.sponsorshipRecord.count({ where: { txHash: { not: null } } }),
      prisma.delegation.count({ where: { status: 'ACTIVE' } }),
      prisma.delegation.count(),
      prisma.delegation.count({ where: { mdfDelegationHash: { not: null } } }),
      prisma.delegationUsage.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.delegationUsage.count({ where: { createdAt: { gte: dayAgo }, success: true } }),
      prisma.approvedAgent.count({ where: { isActive: true } }),
      prisma.protocolSponsor.count(),
    ]);

    return NextResponse.json(
      {
        source: 'postgresql',
        sponsorshipRecordsTotal,
        sponsorshipRecordsLast24h,
        sponsorshipRecordsWithTxHash,
        delegationsActive,
        delegationsTotal,
        delegationsWithMdf,
        delegationUsageLast24h,
        delegationUsageSuccessLast24h,
        approvedAgentsActive,
        protocolsRegistered,
        updatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load verifiable metrics' },
      { status: 500 }
    );
  }
}
