/**
 * Policy Configuration Endpoint
 *
 * POST /api/v1/protocol/:id/policy
 *
 * Update protocol's runtime policy configuration.
 * Requires API key authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updateProtocolPolicyConfig } from '@/src/lib/protocol/policy-config';
import { authenticateRequest } from '@/src/lib/auth/api-key-auth';
import { logger } from '@/src/lib/logger';

const PolicyConfigSchema = z.object({
  dailyBudgetUSD: z.number().min(0.01).max(10000).optional(),
  gasPriceMaxGwei: z.number().min(0.1).max(1000).optional(),
  maxSponsorshipsPerDay: z.number().int().min(1).max(1000).optional(),
  whitelistedContracts: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
  blacklistedWallets: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
});

type PolicyConfigUpdate = z.infer<typeof PolicyConfigSchema>;

export async function POST(
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
          error: 'Unauthorized: Cannot modify other protocol\'s policy',
        },
        { status: 403 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validation = PolicyConfigSchema.safeParse(body);

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

    const updates: PolicyConfigUpdate = validation.data;

    // Update policy configuration
    await updateProtocolPolicyConfig(requestedProtocolId, updates);

    logger.info('[API] Policy config updated', {
      protocolId: requestedProtocolId,
      updates: Object.keys(updates),
    });

    return NextResponse.json({
      success: true,
      message: 'Policy configuration updated successfully',
      updated: Object.keys(updates),
    });
  } catch (err) {
    logger.error('[API] Failed to update policy config', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update policy',
      },
      { status: 500 }
    );
  }
}
