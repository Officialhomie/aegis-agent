/**
 * GET /api/dashboard/guarantees-summary
 * Real ExecutionGuarantee counts and locked USD from Postgres.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';

const prisma = getPrisma();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      total,
      active,
      pending,
      depleted,
      expired,
      breached,
      cancelled,
      lockedAgg,
    ] = await Promise.all([
      prisma.executionGuarantee.count(),
      prisma.executionGuarantee.count({ where: { status: 'ACTIVE' } }),
      prisma.executionGuarantee.count({ where: { status: 'PENDING' } }),
      prisma.executionGuarantee.count({ where: { status: 'DEPLETED' } }),
      prisma.executionGuarantee.count({ where: { status: 'EXPIRED' } }),
      prisma.executionGuarantee.count({ where: { status: 'BREACHED' } }),
      prisma.executionGuarantee.count({ where: { status: 'CANCELLED' } }),
      prisma.executionGuarantee.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { lockedAmountUsd: true },
      }),
    ]);

    return NextResponse.json(
      {
        total,
        byStatus: {
          ACTIVE: active,
          PENDING: pending,
          DEPLETED: depleted,
          EXPIRED: expired,
          BREACHED: breached,
          CANCELLED: cancelled,
        },
        activeLockedUsd: lockedAgg._sum.lockedAmountUsd ?? 0,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load guarantees summary' },
      { status: 500 }
    );
  }
}
