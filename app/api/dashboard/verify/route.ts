/**
 * Verify a decision hash (on-chain + signature).
 */

import { NextResponse } from 'next/server';
import { verifyDecisionChain } from '../../../../src/lib/verify-decision';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const decisionHash = typeof body.decisionHash === 'string' ? body.decisionHash.trim() : '';
    if (!decisionHash) {
      return NextResponse.json({ error: 'decisionHash required' }, { status: 400 });
    }
    const result = await verifyDecisionChain(decisionHash);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
