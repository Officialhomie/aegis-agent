/**
 * Internal CDP Batch Submit Endpoint
 *
 * POST /api/internal/cdp/batch-submit
 *
 * For Aegis team only: Submit protocols to CDP allowlist.
 * Requires internal admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { submitToCDPAllowlist } from '@/src/lib/protocol/onboarding';
import { logger } from '@/src/lib/logger';

const BatchSubmitSchema = z.object({
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
    const validation = BatchSubmitSchema.safeParse(body);

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

    // Submit to CDP allowlist
    await submitToCDPAllowlist(protocolIds);

    logger.info('[Internal] CDP batch submission completed', {
      count: protocolIds.length,
    });

    return NextResponse.json({
      success: true,
      message: `${protocolIds.length} protocols submitted to CDP allowlist`,
      protocolIds,
      nextAction: 'Manually add these protocols to CDP allowlist in Coinbase dashboard',
    });
  } catch (err) {
    logger.error('[Internal] CDP batch submit failed', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Batch submit failed',
      },
      { status: 500 }
    );
  }
}
