/**
 * MDF Delegation Upgrade API
 *
 * POST /api/delegation/[delegationId]/mdf-upgrade
 *
 * Upgrades an existing Aegis Delegation to MetaMask Delegation Framework (MDF) mode.
 * After this call, the delegation record gains:
 *   - mdfDelegationHash (for on-chain revocation checks)
 *   - serializedMdfDelegation (for building redeemDelegations calldata at execution time)
 *   - delegatorAccountType = DELEGATOR
 *
 * The execution layer then routes to DelegationManager.redeemDelegations() instead of
 * the standard execute(target, value, data) calldata when this delegation is active.
 *
 * Auth: Bearer AEGIS_API_KEY
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';
import {
  createMdfDelegation,
  MdfDelegationUpgradeRequestSchema,
} from '@/src/lib/delegation';
import { resolveDelegationManagerAddress } from '@/src/lib/mdf';

export async function POST(
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

  const { delegationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = MdfDelegationUpgradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { mdfDelegation, delegationManagerAddress, chainId } = parsed.data;

  // Resolve and validate the DelegationManager address
  const resolvedManager =
    delegationManagerAddress ?? resolveDelegationManagerAddress();
  if (!resolvedManager || resolvedManager === '0x0000000000000000000000000000000000000000') {
    return NextResponse.json(
      {
        error: 'DelegationManager address not configured',
        hint: 'Set MDF_DELEGATION_MANAGER_ADDRESS env var or pass delegationManagerAddress in request',
      },
      { status: 422 }
    );
  }

  logger.info('[MDF Upgrade] Upgrading delegation to MDF mode', {
    delegationId,
    delegate: mdfDelegation.delegate,
    delegator: mdfDelegation.delegator,
    caveats: mdfDelegation.caveats.length,
    delegationManagerAddress: resolvedManager,
    chainId,
  });

  const result = await createMdfDelegation({
    aegisDelegationId: delegationId,
    mdfDelegation: {
      delegate: mdfDelegation.delegate as `0x${string}`,
      delegator: mdfDelegation.delegator as `0x${string}`,
      authority: mdfDelegation.authority as `0x${string}`,
      caveats: mdfDelegation.caveats.map((c) => ({
        enforcer: c.enforcer as `0x${string}`,
        terms: c.terms as `0x${string}`,
        args: c.args as `0x${string}`,
      })),
      salt: BigInt(mdfDelegation.salt),
      signature: mdfDelegation.signature as `0x${string}`,
    },
    delegationManagerAddress: resolvedManager as `0x${string}`,
    chainId,
  });

  if (!result.success) {
    logger.warn('[MDF Upgrade] MDF upgrade failed', {
      delegationId,
      error: result.error,
    });
    return NextResponse.json(
      { error: 'MDF upgrade failed', message: result.error },
      { status: 422 }
    );
  }

  logger.info('[MDF Upgrade] Delegation upgraded successfully', {
    delegationId,
    mdfDelegationHash: result.mdfDelegationHash,
  });

  return NextResponse.json({
    success: true,
    delegationId,
    mdfDelegationHash: result.mdfDelegationHash,
    message: 'Delegation upgraded to MDF mode. Execution will now use redeemDelegations calldata.',
  });
}
