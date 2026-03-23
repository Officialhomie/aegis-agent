import { getPrisma } from '@/src/lib/db';
import type { CommandName } from '@/src/lib/agent/openclaw/types';
import { SPONSORSHIP_SENSITIVE_COMMANDS } from '@/src/lib/product/catalog/sponsored-method-metadata';
import { getCapsForTier, normalizeTier, type EntitlementTier } from '@/src/lib/product/services/entitlement-service';

export type PolicyGateDecision = 'ALLOWED' | 'DENIED' | 'PREMIUM_BLOCKED' | 'SKIPPED';

export interface PolicyGateResult {
  decision: PolicyGateDecision;
  reason?: string;
  sponsoredMethodId?: string;
  policyId?: string;
  snapshotId?: string;
  /** For audit rows when OpenClaw session is unbound but a policy exists */
  policyProtocolId?: string;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Pre-execution gate for Aeg-control. Enforces premium tier and sponsorship allowlists/caps.
 */
export async function evaluateProductPolicyGate(params: {
  sessionId: string;
  protocolId: string;
  commandName: CommandName;
}): Promise<PolicyGateResult> {
  const prisma = getPrisma();
  const { sessionId, protocolId, commandName } = params;

  const method = await prisma.sponsoredMethod.findUnique({
    where: { commandName },
  });
  if (!method) {
    return { decision: 'DENIED', reason: `Unknown command catalog entry: ${commandName}` };
  }

  const ent = await prisma.entitlement.findUnique({ where: { sessionId } });
  const tier: EntitlementTier = normalizeTier(ent?.tier ?? 'FREE');
  const caps = getCapsForTier(tier);

  if (method.isPremium && !caps.premiumMethods) {
    return {
      decision: 'PREMIUM_BLOCKED',
      reason: `Command "${commandName}" requires Pro or Team. Upgrade tier to enable premium sponsorable methods.`,
      sponsoredMethodId: method.id,
    };
  }

  if (!SPONSORSHIP_SENSITIVE_COMMANDS.has(commandName)) {
    return {
      decision: 'SKIPPED',
      reason: 'Not a sponsorship-gated command; premium checks only.',
      sponsoredMethodId: method.id,
    };
  }

  const policyWhere: {
    sessionId: string;
    sponsoredMethodId: string;
    status: string;
    revokedAt: null;
    protocolId?: string;
  } = {
    sessionId,
    sponsoredMethodId: method.id,
    status: 'ACTIVE',
    revokedAt: null,
  };
  if (protocolId !== '__no_openclaw_session__') {
    policyWhere.protocolId = protocolId;
  }

  const policy = await prisma.userAgentPolicy.findFirst({
    where: policyWhere,
  });

  if (!policy) {
    return {
      decision: 'DENIED',
      reason: `Method "${commandName}" is not allowlisted for sponsored execution for this session.`,
      sponsoredMethodId: method.id,
    };
  }

  const today = startOfUtcDay(new Date());
  const usedToday = await prisma.productExecutionRecord.count({
    where: {
      sessionId,
      parsedCommand: commandName,
      policyDecision: 'ALLOWED',
      success: true,
      createdAt: { gte: today },
    },
  });

  const effectiveDaily = Math.min(policy.dailyLimit, caps.maxDailySponsoredActions);
  if (usedToday >= effectiveDaily) {
    return {
      decision: 'DENIED',
      reason: `Daily cap reached for "${commandName}" (${usedToday}/${effectiveDaily} successful runs today).`,
      sponsoredMethodId: method.id,
      policyId: policy.id,
    };
  }

  const usedTotal = await prisma.productExecutionRecord.count({
    where: {
      sessionId,
      parsedCommand: commandName,
      policyDecision: 'ALLOWED',
      success: true,
    },
  });
  if (usedTotal >= policy.totalLimit) {
    return {
      decision: 'DENIED',
      reason: `Total action cap reached for "${commandName}" (${usedTotal}/${policy.totalLimit}).`,
      sponsoredMethodId: method.id,
      policyId: policy.id,
    };
  }

  const snapshot = await prisma.policySnapshot.create({
    data: {
      policyId: policy.id,
      snapshotJson: {
        commandName,
        dailyLimit: policy.dailyLimit,
        totalLimit: policy.totalLimit,
        windowHours: policy.windowHours,
        status: policy.status,
        tier,
        effectiveDaily,
        usedToday,
        usedTotal,
      } as object,
    },
  });

  return {
    decision: 'ALLOWED',
    reason: 'Policy OK',
    sponsoredMethodId: method.id,
    policyId: policy.id,
    snapshotId: snapshot.id,
    policyProtocolId: policy.protocolId,
  };
}
