import { getPrisma } from '@/src/lib/db';
import type { PolicyGateDecision } from '@/src/lib/product/gate/policy-gate';

export async function recordProductExecution(params: {
  sessionId: string;
  protocolId: string;
  rawUserText: string;
  parsedCommand: string;
  policyDecision: PolicyGateDecision;
  policyReason?: string;
  policyId?: string | null;
  policySnapshotId?: string | null;
  openClawAuditId?: string | null;
  summaryText: string;
  success: boolean;
  txHash?: string | null;
  decisionHash?: string | null;
}): Promise<string> {
  const prisma = getPrisma();
  const row = await prisma.productExecutionRecord.create({
    data: {
      sessionId: params.sessionId,
      protocolId: params.protocolId,
      rawUserText: params.rawUserText,
      parsedCommand: params.parsedCommand,
      policyDecision: params.policyDecision,
      policyReason: params.policyReason ?? null,
      policyId: params.policyId ?? null,
      policySnapshotId: params.policySnapshotId ?? null,
      openClawAuditId: params.openClawAuditId ?? null,
      summaryText: params.summaryText,
      success: params.success,
      txHash: params.txHash ?? null,
      decisionHash: params.decisionHash ?? null,
    },
  });
  return row.id;
}

export async function listProductExecutions(sessionId: string, limit = 50) {
  const prisma = getPrisma();
  return prisma.productExecutionRecord.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
