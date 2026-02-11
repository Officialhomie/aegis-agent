/**
 * Agent Delegations API
 *
 * Endpoints:
 * - GET /api/agent/[agentAddress]/delegations - List delegations for an agent
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import { listDelegations, ListDelegationsQuerySchema } from '@/src/lib/delegation';

/**
 * GET - List delegations where this agent is the delegatee.
 *
 * Query params:
 * - status: ACTIVE, REVOKED, EXPIRED, EXHAUSTED, ALL (default: ACTIVE)
 * - limit: Max results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ agentAddress: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { agentAddress } = await context.params;

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(agentAddress)) {
      return NextResponse.json(
        { error: 'Invalid agent address format' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = {
      agent: agentAddress,
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    };

    const parsed = ListDelegationsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const delegations = await listDelegations(parsed.data);

    // Calculate aggregate stats
    const activeCount = delegations.filter((d) => d.status === 'ACTIVE').length;
    const totalBudget = delegations.reduce(
      (sum, d) => sum + BigInt(d.gasBudgetWei),
      BigInt(0)
    );
    const totalRemaining = delegations.reduce(
      (sum, d) => sum + BigInt(d.gasBudgetRemaining),
      BigInt(0)
    );

    return NextResponse.json({
      agentAddress: agentAddress.toLowerCase(),
      delegations,
      count: delegations.length,
      activeCount,
      stats: {
        totalGasBudgetWei: totalBudget.toString(),
        totalRemainingWei: totalRemaining.toString(),
        uniqueDelegators: [...new Set(delegations.map((d) => d.delegator))].length,
      },
      query: {
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to list agent delegations', { error: message });

    return NextResponse.json(
      { error: 'Failed to list agent delegations', message },
      { status: 500 }
    );
  }
}
