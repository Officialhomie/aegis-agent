/**
 * Protocol Registration Endpoint
 *
 * POST /api/v1/protocol/register
 *
 * Self-serve protocol onboarding:
 * 1. Validates deposit transaction
 * 2. Generates API key
 * 3. Approves for simulation mode (30 days)
 * 4. Returns API key and instructions
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerProtocol } from '@/lib/protocol/onboarding';
import { generateApiKey, hashApiKey } from '@/lib/auth/api-key-auth';
import { logger } from '@/lib/logger';

const RegisterRequestSchema = z.object({
  protocolId: z.string().min(2).max(50).regex(/^[a-z0-9-_]+$/),
  name: z.string().min(2).max(100),
  notificationEmail: z.string().email(),
  notificationWebhook: z.string().url().optional(),
  initialDepositTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  whitelistedContracts: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
  estimatedMonthlyVolume: z.number().min(0).max(10_000_000),
});

type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validation = RegisterRequestSchema.safeParse(body);

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

    const data: RegisterRequest = validation.data;

    // TODO: Verify deposit transaction on-chain
    // For now, we trust the provided tx hash
    // In production, should verify:
    // - Transaction exists and is confirmed (3+ blocks)
    // - Sent to TREASURY_USDC_ADDRESS
    // - Amount >= minimum deposit requirement

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    // Register protocol
    const { protocolId, simulationModeUntil } = await registerProtocol(
      {
        protocolId: data.protocolId,
        name: data.name,
        notificationEmail: data.notificationEmail,
        notificationWebhook: data.notificationWebhook,
        initialDepositTxHash: data.initialDepositTxHash,
        whitelistedContracts: data.whitelistedContracts,
        estimatedMonthlyVolume: data.estimatedMonthlyVolume,
      },
      apiKeyHash
    );

    logger.info('[API] Protocol registered', { protocolId });

    // Return success response with API key
    return NextResponse.json({
      success: true,
      protocolId,
      status: 'approved_simulation',
      apiKey, // IMPORTANT: Only time API key is returned in plain text
      simulationModeUntil: simulationModeUntil.toISOString(),
      nextSteps: [
        'Store your API key securely (it will not be shown again)',
        'Use simulation mode to test sponsorships for 30 days',
        'Your protocol will be submitted to CDP allowlist within 7 days',
        'You will be notified when CDP approves and live mode is enabled',
      ],
      estimatedCdpApprovalDays: 7,
      documentation: {
        apiReference: 'https://docs.aegis.network/api',
        integrationGuide: 'https://docs.aegis.network/integration',
        simulationMode: 'https://docs.aegis.network/simulation',
      },
    });
  } catch (err) {
    logger.error('[API] Registration failed', { error: err });

    // Check for duplicate protocol ID
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return NextResponse.json(
        {
          success: false,
          error: 'Protocol ID already exists',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      },
      { status: 500 }
    );
  }
}
