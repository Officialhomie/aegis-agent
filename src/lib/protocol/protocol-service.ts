/**
 * ProtocolSponsor Service
 *
 * CRUD operations for managing protocol sponsors.
 * Provides administrative control over protocol configurations,
 * tier policies, and onboarding status.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import type { OnboardingStatus } from '@prisma/client';

/**
 * Parameters for creating a protocol
 */
export interface CreateProtocolParams {
  protocolId: string;
  name: string;
  balanceUSD?: number;
  minAgentTier?: 1 | 2 | 3;
  whitelistedContracts?: string[];
  notificationEmail?: string;
  notificationWebhook?: string;
  tier?: 'bronze' | 'silver' | 'gold';
}

/**
 * Parameters for updating a protocol
 */
export interface UpdateProtocolParams {
  protocolId: string;
  updates: {
    name?: string;
    minAgentTier?: 1 | 2 | 3;
    requireERC8004?: boolean;
    requireERC4337?: boolean;
    whitelistedContracts?: string[];
    notificationEmail?: string;
    notificationWebhook?: string;
    tier?: 'bronze' | 'silver' | 'gold';
    policyConfig?: Record<string, unknown>;
  };
}

/**
 * Full protocol details returned by getProtocolDetails
 */
export interface ProtocolDetails {
  id: string;
  protocolId: string;
  name: string;
  balanceUSD: number;
  totalSpent: number;
  sponsorshipCount: number;
  whitelistedContracts: string[];
  tier: string;
  createdAt: Date;
  updatedAt: Date;

  // Onboarding
  onboardingStatus: OnboardingStatus;
  simulationModeUntil: Date | null;

  // Tier policies
  minAgentTier: number;
  requireERC8004: boolean;
  requireERC4337: boolean;
  tierPausedUntil: Record<string, Date | null> | null;

  // Guarantees
  totalGuaranteedUsd: number;
  guaranteeReserveUsd: number;

  // Contact
  notificationEmail: string | null;
  notificationWebhook: string | null;

  // Stats (computed)
  activeAgentCount?: number;
  activeGuaranteeCount?: number;
}

/**
 * Protocol summary for list operations
 */
export interface ProtocolSummary {
  id: string;
  protocolId: string;
  name: string;
  balanceUSD: number;
  onboardingStatus: OnboardingStatus;
  minAgentTier: number;
  tier: string;
  createdAt: Date;
}

/**
 * Create a new protocol sponsor
 */
export async function createProtocol(
  params: CreateProtocolParams
): Promise<ProtocolDetails> {
  const prisma = getPrisma();

  // Check if protocol already exists
  const existing = await prisma.protocolSponsor.findUnique({
    where: { protocolId: params.protocolId },
  });

  if (existing) {
    throw new Error(`Protocol already exists: ${params.protocolId}`);
  }

  const protocol = await prisma.protocolSponsor.create({
    data: {
      protocolId: params.protocolId,
      name: params.name,
      balanceUSD: params.balanceUSD ?? 0,
      totalSpent: 0,
      sponsorshipCount: 0,
      whitelistedContracts: params.whitelistedContracts ?? [],
      tier: params.tier ?? 'bronze',
      minAgentTier: params.minAgentTier ?? 1,
      requireERC8004: false,
      requireERC4337: false,
      onboardingStatus: 'PENDING_REVIEW',
      notificationEmail: params.notificationEmail,
      notificationWebhook: params.notificationWebhook,
      onboardingEvents: {
        create: {
          eventType: 'CREATED_VIA_OPENCLAW',
          eventData: {
            createdAt: new Date().toISOString(),
          },
        },
      },
    },
  });

  logger.info('[ProtocolService] Created protocol', {
    protocolId: params.protocolId,
    id: protocol.id,
    name: params.name,
  });

  return {
    ...protocol,
    tierPausedUntil: protocol.tierPausedUntil as Record<string, Date | null> | null,
  };
}

/**
 * Update a protocol
 */
export async function updateProtocol(
  params: UpdateProtocolParams
): Promise<ProtocolDetails> {
  const prisma = getPrisma();

  const existing = await prisma.protocolSponsor.findUnique({
    where: { protocolId: params.protocolId },
  });

  if (!existing) {
    throw new Error(`Protocol not found: ${params.protocolId}`);
  }

  if (existing.onboardingStatus === 'SUSPENDED') {
    throw new Error(`Protocol is suspended: ${params.protocolId}`);
  }

  const updateData: Record<string, unknown> = {};

  if (params.updates.name !== undefined) {
    updateData.name = params.updates.name;
  }

  if (params.updates.minAgentTier !== undefined) {
    if (params.updates.minAgentTier < 1 || params.updates.minAgentTier > 3) {
      throw new Error('minAgentTier must be 1, 2, or 3');
    }
    updateData.minAgentTier = params.updates.minAgentTier;
  }

  if (params.updates.requireERC8004 !== undefined) {
    updateData.requireERC8004 = params.updates.requireERC8004;
    if (params.updates.requireERC8004) {
      // If requiring ERC-8004, automatically set minAgentTier to 1
      updateData.minAgentTier = 1;
    }
  }

  if (params.updates.requireERC4337 !== undefined) {
    updateData.requireERC4337 = params.updates.requireERC4337;
    if (params.updates.requireERC4337 && !params.updates.requireERC8004) {
      // If requiring ERC-4337, minimum tier is 2
      const currentMin = params.updates.minAgentTier ?? existing.minAgentTier;
      if (currentMin > 2) {
        updateData.minAgentTier = 2;
      }
    }
  }

  if (params.updates.whitelistedContracts !== undefined) {
    updateData.whitelistedContracts = params.updates.whitelistedContracts;
  }

  if (params.updates.notificationEmail !== undefined) {
    updateData.notificationEmail = params.updates.notificationEmail;
  }

  if (params.updates.notificationWebhook !== undefined) {
    updateData.notificationWebhook = params.updates.notificationWebhook;
  }

  if (params.updates.tier !== undefined) {
    updateData.tier = params.updates.tier;
  }

  if (params.updates.policyConfig !== undefined) {
    updateData.policyConfig = params.updates.policyConfig;
  }

  const updated = await prisma.protocolSponsor.update({
    where: { protocolId: params.protocolId },
    data: updateData,
  });

  logger.info('[ProtocolService] Updated protocol', {
    protocolId: params.protocolId,
    updates: Object.keys(params.updates),
  });

  return {
    ...updated,
    tierPausedUntil: updated.tierPausedUntil as Record<string, Date | null> | null,
  };
}

/**
 * Archive (suspend) a protocol
 */
export async function archiveProtocol(protocolId: string): Promise<void> {
  const prisma = getPrisma();

  const existing = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
  });

  if (!existing) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  if (existing.onboardingStatus === 'SUSPENDED') {
    // Already suspended
    return;
  }

  await prisma.protocolSponsor.update({
    where: { protocolId },
    data: {
      onboardingStatus: 'SUSPENDED',
    },
  });

  // Record event
  await prisma.onboardingEvent.create({
    data: {
      protocolId,
      eventType: 'SUSPENDED_VIA_OPENCLAW',
      eventData: {
        suspendedAt: new Date().toISOString(),
        previousStatus: existing.onboardingStatus,
      },
    },
  });

  logger.info('[ProtocolService] Archived protocol', {
    protocolId,
    previousStatus: existing.onboardingStatus,
  });
}

/**
 * Reactivate a suspended protocol
 */
export async function reactivateProtocol(
  protocolId: string,
  newStatus?: OnboardingStatus
): Promise<ProtocolDetails> {
  const prisma = getPrisma();

  const existing = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
  });

  if (!existing) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  if (existing.onboardingStatus !== 'SUSPENDED') {
    throw new Error(`Protocol is not suspended: ${protocolId}`);
  }

  // Determine appropriate status to restore to
  const restoredStatus = newStatus ?? 'APPROVED_SIMULATION';

  const updated = await prisma.protocolSponsor.update({
    where: { protocolId },
    data: {
      onboardingStatus: restoredStatus,
    },
  });

  // Record event
  await prisma.onboardingEvent.create({
    data: {
      protocolId,
      eventType: 'REACTIVATED_VIA_OPENCLAW',
      eventData: {
        reactivatedAt: new Date().toISOString(),
        newStatus: restoredStatus,
      },
    },
  });

  logger.info('[ProtocolService] Reactivated protocol', {
    protocolId,
    newStatus: restoredStatus,
  });

  return {
    ...updated,
    tierPausedUntil: updated.tierPausedUntil as Record<string, Date | null> | null,
  };
}

/**
 * Get full protocol details with stats
 */
export async function getProtocolDetails(
  protocolId: string
): Promise<ProtocolDetails | null> {
  const prisma = getPrisma();

  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
    include: {
      _count: {
        select: {
          approvedAgents: {
            where: { isActive: true },
          },
          guarantees: {
            where: { status: 'ACTIVE' },
          },
        },
      },
    },
  });

  if (!protocol) {
    return null;
  }

  return {
    ...protocol,
    tierPausedUntil: protocol.tierPausedUntil as Record<string, Date | null> | null,
    activeAgentCount: protocol._count.approvedAgents,
    activeGuaranteeCount: protocol._count.guarantees,
  };
}

/**
 * List protocols with optional filters
 */
export async function listProtocols(options?: {
  status?: OnboardingStatus;
  tier?: string;
  limit?: number;
  offset?: number;
}): Promise<ProtocolSummary[]> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = {};

  if (options?.status) {
    where.onboardingStatus = options.status;
  }

  if (options?.tier) {
    where.tier = options.tier;
  }

  const protocols = await prisma.protocolSponsor.findMany({
    where,
    select: {
      id: true,
      protocolId: true,
      name: true,
      balanceUSD: true,
      onboardingStatus: true,
      minAgentTier: true,
      tier: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });

  return protocols;
}

/**
 * Count protocols
 */
export async function countProtocols(options?: {
  status?: OnboardingStatus;
  tier?: string;
}): Promise<number> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = {};

  if (options?.status) {
    where.onboardingStatus = options.status;
  }

  if (options?.tier) {
    where.tier = options.tier;
  }

  return prisma.protocolSponsor.count({ where });
}

/**
 * Format protocol details for display
 */
export function formatProtocolDetails(protocol: ProtocolDetails): string {
  const statusEmoji =
    protocol.onboardingStatus === 'LIVE' ? 'LIVE' :
    protocol.onboardingStatus === 'SUSPENDED' ? 'SUSPENDED' :
    protocol.onboardingStatus === 'APPROVED_SIMULATION' ? 'SIMULATION' :
    protocol.onboardingStatus;

  const tierReqs = [];
  if (protocol.requireERC8004) tierReqs.push('ERC-8004 required');
  else if (protocol.requireERC4337) tierReqs.push('ERC-4337+ required');
  else tierReqs.push(`Min tier: ${protocol.minAgentTier}`);

  const lines = [
    `Protocol: ${protocol.name}`,
    `ID: ${protocol.protocolId}`,
    `Status: ${statusEmoji}`,
    `Service Tier: ${protocol.tier.toUpperCase()}`,
    '',
    'Financials:',
    `  Balance: $${protocol.balanceUSD.toFixed(2)}`,
    `  Total Spent: $${protocol.totalSpent.toFixed(2)}`,
    `  Sponsorships: ${protocol.sponsorshipCount}`,
    `  Guaranteed: $${protocol.totalGuaranteedUsd.toFixed(2)}`,
    `  Reserve: $${protocol.guaranteeReserveUsd.toFixed(2)}`,
    '',
    'Tier Policy:',
    `  ${tierReqs.join(', ')}`,
  ];

  if (protocol.activeAgentCount !== undefined) {
    lines.push(`  Active Agents: ${protocol.activeAgentCount}`);
  }

  if (protocol.activeGuaranteeCount !== undefined) {
    lines.push(`  Active Guarantees: ${protocol.activeGuaranteeCount}`);
  }

  if (protocol.whitelistedContracts.length > 0) {
    lines.push('');
    lines.push('Whitelisted Contracts:');
    for (const contract of protocol.whitelistedContracts.slice(0, 5)) {
      lines.push(`  ${contract.slice(0, 10)}...${contract.slice(-8)}`);
    }
    if (protocol.whitelistedContracts.length > 5) {
      lines.push(`  ... and ${protocol.whitelistedContracts.length - 5} more`);
    }
  }

  lines.push('');
  lines.push(`Created: ${protocol.createdAt.toISOString().split('T')[0]}`);
  lines.push(`Updated: ${protocol.updatedAt.toISOString().split('T')[0]}`);

  return lines.join('\n');
}

/**
 * Format protocol list for display
 */
export function formatProtocolList(protocols: ProtocolSummary[]): string {
  if (protocols.length === 0) {
    return 'No protocols found.';
  }

  const lines = [`Protocols (${protocols.length}):`];

  for (const p of protocols) {
    const status =
      p.onboardingStatus === 'LIVE' ? 'LIVE' :
      p.onboardingStatus === 'SUSPENDED' ? 'SUSP' :
      p.onboardingStatus === 'APPROVED_SIMULATION' ? 'SIM' :
      p.onboardingStatus.slice(0, 4);

    lines.push(
      `  [${status}] ${p.name} (${p.protocolId}) - $${p.balanceUSD.toFixed(0)} ${p.tier}`
    );
  }

  return lines.join('\n');
}
