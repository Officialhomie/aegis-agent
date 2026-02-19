/**
 * Internal CDP Mark Approved Endpoint
 *
 * POST /api/internal/cdp/mark-approved
 *
 * For Aegis team only: Mark protocols as CDP-approved and transition to live mode.
 * Requires internal admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { markCDPApproved } from '@/src/lib/protocol/onboarding';
import { logger } from '@/src/lib/logger';

const MarkApprovedSchema = z.object({
  protocolIds: z.array(z.string()).min(1).max(100),
});

// Simple internal auth - in production, use proper admin authentication
function authenticateInternalRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const internalApiKey = process.env.AEGIS_INTERNAL_API_KEY;

  if (!internalApiKey) {
    logger.error('[Internal] AEGIS_INTERNAL_API_KEY not configured');
    return false;
  }

  return authHeader === `Bearer ${internalApiKey}`;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate internal request
    if (!authenticateInternalRequest(request)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid internal API key',
        },
        { status: 401 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validation = MarkApprovedSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { protocolIds } = validation.data;

    // Mark as CDP approved
    await markCDPApproved(protocolIds);

    logger.info('[Internal] CDP approval completed', {
      count: protocolIds.length,
    });

    return NextResponse.json({
      success: true,
      message: `${protocolIds.length} protocols marked as CDP approved and transitioned to LIVE mode`,
      protocolIds,
      nextAction: 'Protocols will receive notification and can now execute live sponsorships',
    });
  } catch (err) {
    logger.error('[Internal] CDP mark approved failed', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Mark approved failed',
      },
      { status: 500 }
    );
  }
}
