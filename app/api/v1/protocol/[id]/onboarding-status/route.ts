/**
 * Onboarding Status Endpoint
 *
 * GET /api/v1/protocol/:id/onboarding-status
 *
 * Returns protocol's onboarding status and next actions.
 * Requires API key authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingStatus } from '@/src/lib/protocol/onboarding';
import { authenticateRequest } from '@/src/lib/auth/api-key-auth';
import { logger } from '@/src/lib/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestedProtocolId } = await context.params;

    // Authenticate request
    const authHeader = request.headers.get('authorization');
    const authResult = await authenticateRequest(authHeader);

    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error,
        },
        { status: 401 }
      );
    }

    // Verify protocol ID matches authenticated protocol
    if (authResult.protocolId !== requestedProtocolId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Cannot access other protocol\'s status',
        },
        { status: 403 }
      );
    }

    // Get onboarding status
    const status = await getOnboardingStatus(requestedProtocolId);

    logger.info('[API] Onboarding status retrieved', {
      protocolId: requestedProtocolId,
      status: status.onboardingStatus,
    });

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (err) {
    logger.error('[API] Failed to get onboarding status', { error: err });

    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Protocol not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get status',
      },
      { status: 500 }
    );
  }
}
