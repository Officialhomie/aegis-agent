/**
 * Delegation Usage History API
 *
 * Endpoints:
 * - GET /api/delegation/[delegationId]/usage - Get usage history for a delegation
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import { getDelegation, getDelegationUsage } from '@/src/lib/delegation';

/**
 * GET - Get usage history for a delegation.
 *
 * Query params:
 * - limit: Max results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ delegationId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { delegationId } = await context.params;
    const { searchParams } = new URL(request.url);

    // Parse pagination params
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit parameter' },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid offset parameter' },
        { status: 400 }
      );
    }

    // Verify delegation exists
    const delegation = await getDelegation(delegationId);
    if (!delegation) {
      return NextResponse.json(
        { error: 'Delegation not found', delegationId },
        { status: 404 }
      );
    }

    // Get usage history
    const usage = await getDelegationUsage(delegationId, limit, offset);

    return NextResponse.json({
      delegationId,
      delegator: delegation.delegator,
      agent: delegation.agent,
      usage,
      count: usage.length,
      pagination: { limit, offset },
      summary: {
        totalUsage: delegation.usageCount,
        totalGasUsed: delegation.totalGasUsed,
        gasBudgetSpent: delegation.gasBudgetSpent,
        gasBudgetRemaining: delegation.gasBudgetRemaining,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to get delegation usage', { error: message });

    return NextResponse.json(
      { error: 'Failed to get delegation usage', message },
      { status: 500 }
    );
  }
}
