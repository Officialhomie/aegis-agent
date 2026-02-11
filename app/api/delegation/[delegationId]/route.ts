/**
 * Single Delegation API
 *
 * Endpoints:
 * - GET /api/delegation/[delegationId] - Get delegation details
 * - DELETE /api/delegation/[delegationId] - Revoke delegation
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import {
  getDelegation,
  revokeDelegation,
  RevokeDelegationRequestSchema,
} from '@/src/lib/delegation';

/**
 * GET - Get delegation details by ID.
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

    const delegation = await getDelegation(delegationId);

    if (!delegation) {
      return NextResponse.json(
        { error: 'Delegation not found', delegationId },
        { status: 404 }
      );
    }

    return NextResponse.json({ delegation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to get delegation', { error: message });

    return NextResponse.json(
      { error: 'Failed to get delegation', message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Revoke a delegation.
 *
 * Body (optional):
 * - reason: String explaining why delegation was revoked
 *
 * Headers:
 * - X-Delegator-Address: The delegator's address (must match delegation)
 */
export async function DELETE(
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

    // Get delegator address from header
    const delegatorAddress = request.headers.get('X-Delegator-Address');
    if (!delegatorAddress) {
      return NextResponse.json(
        { error: 'Missing X-Delegator-Address header' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(delegatorAddress)) {
      return NextResponse.json(
        { error: 'Invalid X-Delegator-Address format' },
        { status: 400 }
      );
    }

    // Parse optional body
    let reason: string | undefined;
    try {
      const body = await request.json();
      const parsed = RevokeDelegationRequestSchema.safeParse(body);
      if (parsed.success) {
        reason = parsed.data.reason;
      }
    } catch {
      // Body is optional, ignore parsing errors
    }

    const result = await revokeDelegation(delegationId, delegatorAddress, reason);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      return NextResponse.json(
        { error: 'Failed to revoke delegation', message: result.error },
        { status }
      );
    }

    logger.info('[DelegationAPI] Delegation revoked', {
      delegationId,
      delegator: delegatorAddress,
      reason,
    });

    return NextResponse.json({
      success: true,
      action: 'revoked',
      delegationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DelegationAPI] Failed to revoke delegation', { error: message });

    return NextResponse.json(
      { error: 'Failed to revoke delegation', message },
      { status: 500 }
    );
  }
}
