/**
 * Execution Guarantees API
 *
 * POST /api/v1/guarantees - Create a new guarantee
 * GET /api/v1/guarantees - List guarantees for a protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/src/lib/logger';
import {
  createGuarantee,
  listGuarantees,
  CreateGuaranteeRequest,
  ServiceTier,
  GuaranteeType,
  GuaranteeStatus,
} from '@/src/lib/agent/guarantees';

/**
 * POST /api/v1/guarantees
 *
 * Create a new execution guarantee.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const {
      type,
      beneficiary,
      protocolId,
      budgetUsd,
      txCount,
      maxLatencyMs,
      breachPenalty,
      maxGasPrice,
      validFrom,
      validUntil,
      tier,
    } = body;

    if (!type || !beneficiary || !protocolId || !validFrom || !validUntil || !tier) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: type, beneficiary, protocolId, validFrom, validUntil, tier',
        },
        { status: 400 }
      );
    }

    // Validate type
    if (!['GAS_BUDGET', 'TX_COUNT', 'TIME_WINDOW'].includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid type. Must be GAS_BUDGET, TX_COUNT, or TIME_WINDOW',
        },
        { status: 400 }
      );
    }

    // Validate tier
    if (!['BRONZE', 'SILVER', 'GOLD'].includes(tier)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid tier. Must be BRONZE, SILVER, or GOLD',
        },
        { status: 400 }
      );
    }

    // Validate beneficiary address
    if (!/^0x[a-fA-F0-9]{40}$/.test(beneficiary)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid beneficiary address format',
        },
        { status: 400 }
      );
    }

    // Parse dates
    const from = new Date(validFrom);
    const until = new Date(validUntil);

    if (isNaN(from.getTime()) || isNaN(until.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date format for validFrom or validUntil',
        },
        { status: 400 }
      );
    }

    if (until <= from) {
      return NextResponse.json(
        {
          success: false,
          error: 'validUntil must be after validFrom',
        },
        { status: 400 }
      );
    }

    // Build request
    const guaranteeRequest: CreateGuaranteeRequest = {
      type: type as GuaranteeType,
      beneficiary,
      protocolId,
      budgetUsd: budgetUsd ? parseFloat(budgetUsd) : undefined,
      txCount: txCount ? parseInt(txCount) : undefined,
      maxLatencyMs: maxLatencyMs ? parseInt(maxLatencyMs) : undefined,
      breachPenalty: breachPenalty ? parseFloat(breachPenalty) : undefined,
      maxGasPrice: maxGasPrice ? BigInt(maxGasPrice) : undefined,
      validFrom: from,
      validUntil: until,
      tier: tier as ServiceTier,
    };

    // Create guarantee
    const result = await createGuarantee(guaranteeRequest);

    logger.info('[API] Created guarantee', {
      guaranteeId: result.guaranteeId,
      protocolId,
      tier,
    });

    return NextResponse.json({
      success: true,
      guarantee: {
        guaranteeId: result.guaranteeId,
        status: result.status,
        lockedAmount: result.lockedAmount,
        premiumCharged: result.premiumCharged,
        effectiveFrom: result.effectiveFrom.toISOString(),
        effectiveUntil: result.effectiveUntil.toISOString(),
        slaTerms: result.slaTerms,
      },
    });
  } catch (err) {
    logger.error('[API] Failed to create guarantee', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create guarantee',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/guarantees
 *
 * List guarantees for a protocol.
 *
 * Query params:
 * - protocolId (required)
 * - status (optional): Filter by status
 * - beneficiary (optional): Filter by agent address
 * - limit (optional): Max results (default 50)
 * - offset (optional): Skip results (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const protocolId = searchParams.get('protocolId');
    const status = searchParams.get('status');
    const beneficiary = searchParams.get('beneficiary');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = parseInt(searchParams.get('offset') ?? '0');

    if (!protocolId) {
      return NextResponse.json(
        {
          success: false,
          error: 'protocolId query parameter is required',
        },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !['PENDING', 'ACTIVE', 'DEPLETED', 'EXPIRED', 'BREACHED', 'CANCELLED'].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid status. Must be PENDING, ACTIVE, DEPLETED, EXPIRED, BREACHED, or CANCELLED',
        },
        { status: 400 }
      );
    }

    const guarantees = await listGuarantees(protocolId, {
      status: status as GuaranteeStatus | undefined,
      beneficiary: beneficiary ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      guarantees: guarantees.map((g) => ({
        id: g.id,
        type: g.type,
        beneficiary: g.beneficiary,
        status: g.status,
        tier: g.tier,
        budget: {
          total: g.budgetUsd ?? g.txCount ?? 0,
          used: g.type === 'TX_COUNT' ? g.usedTxCount : g.usedUsd,
          utilizationPct:
            g.type === 'TX_COUNT'
              ? g.txCount ? (g.usedTxCount / g.txCount) * 100 : 0
              : g.budgetUsd ? (g.usedUsd / g.budgetUsd) * 100 : 0,
        },
        validFrom: g.validFrom.toISOString(),
        validUntil: g.validUntil.toISOString(),
        createdAt: g.createdAt.toISOString(),
      })),
      pagination: {
        limit,
        offset,
        hasMore: guarantees.length === limit,
      },
    });
  } catch (err) {
    logger.error('[API] Failed to list guarantees', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to list guarantees',
      },
      { status: 500 }
    );
  }
}
