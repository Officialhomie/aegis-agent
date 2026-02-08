/**
 * POST /api/v1/sponsorship/check-eligibility
 *
 * Dry-run eligibility check without executing.
 * Constructs a synthetic SPONSOR_TRANSACTION Decision and runs validateSponsorshipPolicy.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateSponsorshipPolicy } from '@/src/lib/agent/policy/sponsorship-rules';
import { observeGasPrice } from '@/src/lib/agent/observe';
import type { AgentConfig } from '@/src/lib/agent';

const CheckEligibilitySchema = z.object({
  agentWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid agent wallet address'),
  protocolId: z.string().min(1, 'protocolId required'),
  estimatedCostUSD: z.number().min(0).default(0.01),
  targetContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  maxGasLimit: z.number().int().positive().optional().default(200000),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = CheckEligibilitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const syntheticDecision = {
      action: 'SPONSOR_TRANSACTION' as const,
      confidence: 1,
      reasoning: 'Eligibility check (dry-run)',
      parameters: {
        agentWallet: parsed.data.agentWallet,
        protocolId: parsed.data.protocolId,
        estimatedCostUSD: parsed.data.estimatedCostUSD,
        targetContract: parsed.data.targetContract,
        maxGasLimit: parsed.data.maxGasLimit,
      },
    };

    let currentGasPriceGwei: number | undefined;
    try {
      const gasObs = await observeGasPrice();
      const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
      currentGasPriceGwei =
        gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;
    } catch {
      // Fallback: eligibility check continues without gas price
    }

    const config: AgentConfig = {
      confidenceThreshold: 0.75,
      maxTransactionValueUsd: 10000,
      executionMode: 'SIMULATION',
      gasPriceMaxGwei: 2,
      currentGasPriceGwei,
    };

    const result = await validateSponsorshipPolicy(syntheticDecision, config);

    return NextResponse.json({
      eligible: result.passed,
      errors: result.errors,
      warnings: result.warnings,
      appliedRules: result.appliedRules,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Eligibility check failed' },
      { status: 500 }
    );
  }
}
