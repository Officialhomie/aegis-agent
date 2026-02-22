/**
 * Guarantee Usage History API
 *
 * GET /api/v1/guarantees/:id/usage - Get usage history for a guarantee
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/src/lib/logger';
import { getGuaranteeUsageHistory } from '@/src/lib/agent/guarantees';

/**
 * GET /api/v1/guarantees/:id/usage
 *
 * Get usage history for a specific guarantee.
 * Includes transaction details and SLA compliance for each usage.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Guarantee ID is required',
        },
        { status: 400 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Validate pagination
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid limit. Must be between 1 and 100.',
        },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid offset. Must be >= 0.',
        },
        { status: 400 }
      );
    }

    const { records, total, summary } = await getGuaranteeUsageHistory(id, {
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      usage: records.map((record) => ({
        id: record.id,
        userOpHash: record.userOpHash,
        txHash: record.txHash,
        gasUsed: record.gasUsed.toString(),
        gasPriceWei: record.gasPriceWei.toString(),
        costWei: record.costWei.toString(),
        costUsd: record.costUsd,
        submittedAt: record.submittedAt.toISOString(),
        includedAt: record.includedAt?.toISOString() ?? null,
        latencyMs: record.latencyMs,
        slaMet: record.slaMet,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + records.length < total,
      },
      summary: {
        totalRecords: summary.totalRecords,
        totalCostUsd: summary.totalCostUsd,
        avgLatencyMs: summary.avgLatencyMs,
        slaMetCount: summary.slaMetCount,
        slaBreachedCount: summary.slaBreachedCount,
        complianceRate: summary.complianceRate,
      },
    });
  } catch (err) {
    logger.error('[API] Failed to get guarantee usage', { error: err });

    const message = err instanceof Error ? err.message : 'Failed to get guarantee usage';
    const status = message.includes('not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
