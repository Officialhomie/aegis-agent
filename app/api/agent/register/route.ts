/**
 * Manual ERC-8004 agent registration.
 * POST: Register the first active agent on the Identity Registry if not already registered.
 * Returns { agentId, txHash, registryAddress } or { agentId } if already registered.
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { verifyApiAuth } from '../../../../src/lib/auth/api-auth';
import {
  getIdentityRegistryAddress,
  registerWithRegistry,
  uploadToIPFS,
  type AgentMetadata,
} from '../../../../src/lib/agent/identity';

export async function POST(request: Request) {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) {
    return NextResponse.json(
      { error: 'ERC-8004 Identity Registry not configured. Set ERC8004_IDENTITY_REGISTRY_ADDRESS or ERC8004_NETWORK.' },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  try {
    const agent = await prisma.agent.findFirst({ where: { isActive: true } });
    if (!agent) {
      return NextResponse.json({ error: 'No active agent found' }, { status: 404 });
    }
    if (agent.onChainId) {
      return NextResponse.json({
        agentId: agent.onChainId,
        message: 'Agent already registered',
        registryAddress: registryAddress ?? undefined,
      });
    }
    const metadata: AgentMetadata = {
      name: agent.name,
      description: agent.description ?? 'Aegis - Autonomous Gas Sponsorship Agent',
      capabilities: ['observe', 'reason', 'execute', 'sponsorship'],
      version: '1.0.0',
      created: agent.createdAt.toISOString(),
    };
    const uri = await uploadToIPFS(metadata);
    const { agentId, txHash } = await registerWithRegistry(uri);
    await prisma.agent.update({
      where: { id: agent.id },
      data: { onChainId: agentId.toString(), walletAddress: process.env.AGENT_WALLET_ADDRESS ?? undefined },
    });
    return NextResponse.json({
      agentId: agentId.toString(),
      txHash,
      registryAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Registration failed: ${message}` }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
