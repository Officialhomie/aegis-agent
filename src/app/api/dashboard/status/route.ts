/**
 * Dashboard Status API - Exposes agent signing capability and mode
 * GET /api/dashboard/status
 *
 * Returns information about the agent's current operational status including
 * whether signing operations are available.
 */

import { NextResponse } from 'next/server';
import { getKeyGuardState } from '../../../../lib/key-guard';

export async function GET() {
  try {
    const state = getKeyGuardState();

    return NextResponse.json({
      mode: state.mode,
      canSign: state.canSign,
      signingMethod: state.method,
      hasWallet: state.canSign,
      // Don't expose the actual address on public endpoint for security
      // address: state.address,
    });
  } catch (error) {
    // KeyGuard not initialized - this shouldn't happen in normal operation
    return NextResponse.json(
      {
        error: 'KeyGuard not initialized',
        mode: 'UNKNOWN',
        canSign: false,
        signingMethod: 'none',
        hasWallet: false,
      },
      { status: 500 }
    );
  }
}
