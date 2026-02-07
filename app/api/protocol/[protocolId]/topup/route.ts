/**
 * Top-up protocol budget (POST).
 *
 * PRODUCTION MODE: Requires on-chain USDC deposit verification via txHash.
 * The transaction must be a USDC transfer to the Aegis treasury address.
 *
 * Request body:
 * - txHash: Transaction hash of the USDC deposit (required)
 * - chainId: Chain ID where deposit was made (default: 8453 for Base)
 *
 * The endpoint will:
 * 1. Verify the transaction on-chain
 * 2. Confirm it's a USDC transfer to our treasury
 * 3. Credit the protocol balance only after verification
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { z } from 'zod';
import { verifyAndCreditDeposit } from '@/src/lib/agent/observe/usdc-deposits';
import { logger } from '@/src/lib/logger';
import type { Hex } from 'viem';

const prisma = getPrisma();

/**
 * Schema for on-chain verified topup (production).
 * Requires transaction hash for USDC deposit verification.
 */
const OnChainTopupSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format'),
  chainId: z.number().int().positive().optional().default(8453), // Base mainnet
});

/**
 * Legacy schema for trust-based topup (deprecated, dev only).
 * Will be removed in production.
 */
const LegacyTopupSchema = z.object({
  amountUSD: z.number().positive(),
  reference: z.string().optional(),
});

const ALLOW_LEGACY_TOPUP = process.env.ALLOW_LEGACY_TOPUP === 'true';

export async function POST(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));

    // First, verify protocol exists
    const existing = await prisma.protocolSponsor.findUnique({ where: { protocolId } });
    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    // Try on-chain verification first (production flow)
    const onChainParsed = OnChainTopupSchema.safeParse(body);
    if (onChainParsed.success) {
      const { txHash, chainId } = onChainParsed.data;

      logger.info('[Topup] Processing on-chain deposit verification', {
        protocolId,
        txHash: txHash.slice(0, 18) + '...',
        chainId,
      });

      const result = await verifyAndCreditDeposit(protocolId, txHash as Hex);

      if (!result.success) {
        logger.warn('[Topup] Deposit verification failed', {
          protocolId,
          txHash: txHash.slice(0, 18) + '...',
          error: result.error,
        });

        return NextResponse.json({
          error: 'Deposit verification failed',
          details: result.error,
          txHash,
        }, { status: 400 });
      }

      logger.info('[Topup] Deposit verified and credited', {
        protocolId,
        amount: result.amount,
        txHash: txHash.slice(0, 18) + '...',
      });

      return NextResponse.json({
        success: true,
        protocolId,
        txHash,
        chainId,
        amount: result.amount,
        newBalance: result.newBalance,
        verifiedAt: new Date().toISOString(),
      });
    }

    // Legacy flow (deprecated, only in development with explicit flag)
    if (ALLOW_LEGACY_TOPUP) {
      const legacyParsed = LegacyTopupSchema.safeParse(body);
      if (legacyParsed.success) {
        logger.warn('[Topup] Using DEPRECATED legacy topup flow', {
          protocolId,
          amountUSD: legacyParsed.data.amountUSD,
        });

        const protocol = await prisma.protocolSponsor.update({
          where: { protocolId },
          data: { balanceUSD: { increment: legacyParsed.data.amountUSD } },
        });

        return NextResponse.json({
          protocolId: protocol.protocolId,
          balanceUSD: protocol.balanceUSD,
          topupAmount: legacyParsed.data.amountUSD,
          reference: legacyParsed.data.reference,
          warning: 'Legacy topup flow used. This is deprecated and will be removed.',
        });
      }
    }

    // Neither schema matched
    return NextResponse.json({
      error: 'Invalid request',
      message: 'On-chain topup requires txHash (0x... format). Legacy amountUSD topup is deprecated.',
      required: {
        txHash: 'Transaction hash of USDC deposit to treasury (0x...)',
        chainId: 'Optional. Chain ID (default: 8453 for Base)',
      },
    }, { status: 400 });

  } catch (e) {
    logger.error('[Topup] Error processing request', {
      error: e instanceof Error ? e.message : String(e),
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Top-up failed' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check deposit status.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  try {
    const { protocolId } = await context.params;
    const { searchParams } = new URL(request.url);
    const txHash = searchParams.get('txHash');

    // Verify protocol exists
    const protocol = await prisma.protocolSponsor.findUnique({
      where: { protocolId },
      select: {
        protocolId: true,
        balanceUSD: true,
        totalSpent: true,
        tier: true,
      },
    });

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found', protocolId }, { status: 404 });
    }

    // Dynamic import to avoid Prisma type issues at compile time
    const { getProtocolDeposits } = await import('@/src/lib/agent/observe/usdc-deposits');

    // If txHash provided, check specific deposit
    if (txHash) {
      const deposits = await getProtocolDeposits(protocolId);
      const deposit = deposits.find(d => d.txHash === txHash);

      if (!deposit) {
        return NextResponse.json({
          error: 'Deposit not found',
          txHash,
          protocolId,
        }, { status: 404 });
      }

      return NextResponse.json({
        protocolId,
        deposit: {
          id: deposit.id,
          txHash: deposit.txHash,
          amount: deposit.amount,
          tokenAmount: deposit.tokenAmount?.toString(),
          chainId: deposit.chainId,
          confirmed: deposit.confirmed,
          confirmedAt: deposit.confirmedAt,
          createdAt: deposit.createdAt,
        },
        currentBalance: protocol.balanceUSD,
      });
    }

    // Return recent deposits for protocol
    const deposits = await getProtocolDeposits(protocolId);
    const recentDeposits = deposits.slice(0, 20);

    return NextResponse.json({
      protocolId,
      currentBalance: protocol.balanceUSD,
      tier: protocol.tier,
      deposits: recentDeposits.map(d => ({
        id: d.id,
        txHash: d.txHash,
        amount: d.amount,
        tokenAmount: d.tokenAmount?.toString(),
        chainId: d.chainId,
        confirmed: d.confirmed,
        confirmedAt: d.confirmedAt,
        createdAt: d.createdAt,
      })),
      depositCount: recentDeposits.length,
    });

  } catch (e) {
    logger.error('[Topup] Error fetching deposit status', {
      error: e instanceof Error ? e.message : String(e),
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch deposit status' },
      { status: 500 }
    );
  }
}
