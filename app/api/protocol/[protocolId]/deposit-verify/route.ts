/**
 * Verify and credit USDC deposit (POST).
 *
 * This endpoint verifies an on-chain USDC transfer to the Aegis treasury
 * and credits the protocol's balance.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAndCreditDeposit } from '@/src/lib/agent/observe/usdc-deposits';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import type { Hex } from 'viem';

const DepositVerifySchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  // Verify API authentication
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = DepositVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { txHash } = parsed.data;

    logger.info('[API] Deposit verification requested', {
      protocolId,
      txHash: txHash.slice(0, 18) + '...',
    });

    // Verify and credit the deposit
    const result = await verifyAndCreditDeposit(protocolId, txHash as Hex);

    if (!result.success) {
      logger.warn('[API] Deposit verification failed', {
        protocolId,
        txHash: txHash.slice(0, 18) + '...',
        error: result.error,
      });

      return NextResponse.json(
        {
          error: 'Deposit verification failed',
          message: result.error,
          protocolId,
          txHash,
        },
        { status: 400 }
      );
    }

    logger.info('[API] Deposit verified and credited', {
      protocolId,
      txHash: txHash.slice(0, 18) + '...',
      amount: result.amount,
      newBalance: result.newBalance,
    });

    return NextResponse.json({
      success: true,
      protocolId,
      txHash,
      amount: result.amount,
      newBalance: result.newBalance,
      message: result.error ?? 'Deposit credited successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[API] Deposit verification error', { error: message });

    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 }
    );
  }
}

/**
 * Get deposit history for a protocol (GET).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const { getProtocolDeposits } = await import('@/src/lib/agent/observe/usdc-deposits');

    const deposits = await getProtocolDeposits(protocolId);

    return NextResponse.json({
      protocolId,
      deposits: deposits.map((d) => ({
        txHash: d.txHash,
        amount: d.amount,
        tokenSymbol: d.tokenSymbol,
        chainId: d.chainId,
        senderAddress: d.senderAddress,
        confirmed: d.confirmed,
        confirmedAt: d.confirmedAt,
        createdAt: d.createdAt,
      })),
      total: deposits.reduce((sum, d) => sum + d.amount, 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch deposits', message },
      { status: 500 }
    );
  }
}
