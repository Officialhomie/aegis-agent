/**
 * GET /api/v1/passport
 *
 * Returns Gas Passport data for an agent.
 * Query: ?agent=0x... (wallet address) or ?agentOnChainId=... (ERC-8004 on-chain ID).
 */

import { NextResponse } from 'next/server';
import { getPassport, getPassportByOnChainId } from '@/src/lib/agent/identity';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent');
    const agentOnChainId = searchParams.get('agentOnChainId');

    if (agent != null && agentOnChainId != null) {
      return NextResponse.json(
        { error: 'Provide either agent or agentOnChainId, not both' },
        { status: 400 }
      );
    }

    if (agent != null) {
      if (!ADDRESS_REGEX.test(agent)) {
        return NextResponse.json(
          { error: 'Invalid agent address' },
          { status: 400 }
        );
      }
      const passport = await getPassport(agent);
      return NextResponse.json({
        agent,
        ...passport,
      });
    }

    if (agentOnChainId != null) {
      if (agentOnChainId.trim() === '') {
        return NextResponse.json(
          { error: 'agentOnChainId must be non-empty' },
          { status: 400 }
        );
      }
      const passport = await getPassportByOnChainId(agentOnChainId.trim());
      return NextResponse.json({
        agentOnChainId: agentOnChainId.trim(),
        ...passport,
      });
    }

    return NextResponse.json(
      { error: 'Missing query: agent (0x...) or agentOnChainId' },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Passport lookup failed' },
      { status: 500 }
    );
  }
}
