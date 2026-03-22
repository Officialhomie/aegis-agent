import { getPrisma } from '@/src/lib/db';

export async function listPoliciesForSession(sessionId: string) {
  const prisma = getPrisma();
  return prisma.userAgentPolicy.findMany({
    where: { sessionId },
    include: { sponsoredMethod: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function upsertUserPolicy(params: {
  sessionId: string;
  protocolId: string;
  commandName: string;
  dailyLimit: number;
  totalLimit: number;
  windowHours?: number;
  agentAddress?: string | null;
}) {
  const prisma = getPrisma();
  const method = await prisma.sponsoredMethod.findUnique({
    where: { commandName: params.commandName },
  });
  if (!method) throw new Error(`Unknown sponsored method: ${params.commandName}`);

  return prisma.userAgentPolicy.upsert({
    where: {
      sessionId_sponsoredMethodId: {
        sessionId: params.sessionId,
        sponsoredMethodId: method.id,
      },
    },
    create: {
      sessionId: params.sessionId,
      protocolId: params.protocolId,
      agentAddress: params.agentAddress ?? null,
      sponsoredMethodId: method.id,
      dailyLimit: params.dailyLimit,
      totalLimit: params.totalLimit,
      windowHours: params.windowHours ?? 24,
      status: 'ACTIVE',
    },
    update: {
      protocolId: params.protocolId,
      agentAddress: params.agentAddress ?? null,
      dailyLimit: params.dailyLimit,
      totalLimit: params.totalLimit,
      windowHours: params.windowHours ?? 24,
      status: 'ACTIVE',
      revokedAt: null,
    },
    include: { sponsoredMethod: true },
  });
}

export async function revokePolicy(policyId: string) {
  const prisma = getPrisma();
  return prisma.userAgentPolicy.update({
    where: { id: policyId },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}
