/**
 * Delegation Management API
 *
 * User-to-Agent delegation endpoints.
 *
 * Endpoints:
 * - POST /api/delegation - Create a new delegation
 * - GET /api/delegation - List delegations (filter by delegator or agent)
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import {
  createDelegation,
  listDelegations,
  CreateDelegationRequestSchema,
  ListDelegationsQuerySchema,
} from '@/src/lib/delegation';

/**
 * POST - Create a new delegation.
 *
 * Requires EIP-712 signature from the delegator.
 */
export async function POST(request: Request) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = CreateDelegationRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createDelegation(parsed.data);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to create delegation', message: result.error },
        { status: 400 }
      );
    }

    logger.info('[DelegationAPI] Delegation created', {
      id: result.delegation?.id,
      delegator: parsed.data.delegator,
      agent: parsed.data.agent,
    });

    return NextResponse.json({
      success: true,
      delegation: result.delegation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to create delegation', { error: message });

    return NextResponse.json(
      { error: 'Failed to create delegation', message },
      { status: 500 }
    );
  }
}

/**
 * GET - List delegations.
 *
 * Query params:
 * - delegator: Filter by delegator address
 * - agent: Filter by agent address
 * - status: ACTIVE, REVOKED, EXPIRED, EXHAUSTED, ALL (default: ACTIVE)
 * - limit: Max results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(request: Request) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = {
      delegator: searchParams.get('delegator') || undefined,
      agent: searchParams.get('agent') || undefined,
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

    return NextResponse.json({
      delegations,
      count: delegations.length,
      query: {
        delegator: parsed.data.delegator,
        agent: parsed.data.agent,
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to list delegations', { error: message });

    return NextResponse.json(
      { error: 'Failed to list delegations', message },
      { status: 500 }
    );
  }
}
