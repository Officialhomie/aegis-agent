/**
 * Individual Guarantee API
 *
 * GET /api/v1/guarantees/:id - Get guarantee details
 * DELETE /api/v1/guarantees/:id - Cancel a guarantee
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/src/lib/logger';
import { getGuaranteeDetails, cancelGuarantee } from '@/src/lib/agent/guarantees';

/**
 * GET /api/v1/guarantees/:id
 *
 * Get detailed information about a specific guarantee.
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

    const details = await getGuaranteeDetails(id);

    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: 'Guarantee not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      guarantee: {
        id: details.id,
        type: details.type,
        beneficiary: details.beneficiary,
        protocolId: details.protocolId,
        status: details.status,
        tier: details.tier,

        budget: {
          total: details.budget.total,
          used: details.budget.used,
          remaining: details.budget.remaining,
          utilizationPct: details.budget.utilizationPct,
        },

        sla: {
          totalExecutions: details.sla.totalExecutions,
          slaMet: details.sla.slaMet,
          slaBreached: details.sla.slaBreached,
          complianceRate: details.sla.complianceRate,
        },

        financial: {
          lockedAmount: details.financial.lockedAmount,
          premiumPaid: details.financial.premiumPaid,
          refundsIssued: details.financial.refundsIssued,
          netCost: details.financial.netCost,
        },

        validity: {
          from: details.validity.from.toISOString(),
          until: details.validity.until.toISOString(),
          remainingDays: details.validity.remainingDays,
        },

        createdAt: details.createdAt.toISOString(),
        updatedAt: details.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error('[API] Failed to get guarantee', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get guarantee',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/guarantees/:id
 *
 * Cancel a guarantee and return unused budget (minus cancellation fee).
 */
export async function DELETE(
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

    const result = await cancelGuarantee(id);

    logger.info('[API] Cancelled guarantee', {
      guaranteeId: id,
      refundAmount: result.refundAmount,
      cancellationFee: result.cancellationFee,
    });

    return NextResponse.json({
      success: true,
      cancelled: result.cancelled,
      refundAmount: result.refundAmount,
      cancellationFee: result.cancellationFee,
    });
  } catch (err) {
    logger.error('[API] Failed to cancel guarantee', { error: err });

    const message = err instanceof Error ? err.message : 'Failed to cancel guarantee';
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
