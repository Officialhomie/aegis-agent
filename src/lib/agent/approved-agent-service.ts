/**
 * ApprovedAgent Service
 *
 * CRUD operations for managing approved agents per protocol.
 * Each protocol can whitelist agents with specific tiers and budgets.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import { AgentType } from '@prisma/client';

/**
 * Parameters for creating an approved agent
 */
export interface CreateApprovedAgentParams {
  protocolId: string;
  agentAddress: string;
  agentName?: string;
  agentTier?: 1 | 2 | 3;
  agentType?: AgentType;
  maxDailyBudget?: number;
  approvedBy: string;
}

/**
 * Parameters for updating an approved agent
 */
export interface UpdateApprovedAgentParams {
  protocolId: string;
  agentAddress: string;
  updates: {
    agentName?: string;
    agentTier?: 1 | 2 | 3;
    agentType?: AgentType;
    tierOverride?: boolean;
    maxDailyBudget?: number;
    isActive?: boolean;
  };
}

/**
 * Full agent details returned by getApprovedAgent
 */
export interface ApprovedAgentDetails {
  id: string;
  protocolId: string;
  agentAddress: string;
  agentName: string | null;
  agentTier: number;
  agentType: AgentType;
  tierOverride: boolean;
  maxDailyBudget: number;
  isActive: boolean;
  approvedBy: string;
  approvedAt: Date;
  revokedAt: Date | null;
  lastValidated: Date | null;
}

/**
 * Create a new approved agent for a protocol
 */
export async function createApprovedAgent(
  params: CreateApprovedAgentParams
): Promise<ApprovedAgentDetails> {
  const prisma = getPrisma();

  // Validate protocol exists
  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId: params.protocolId },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${params.protocolId}`);
  }

  // Normalize address to lowercase
  const agentAddress = params.agentAddress.toLowerCase();

  // Check if agent already exists (even if revoked)
  const existing = await prisma.approvedAgent.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
  });

  if (existing && existing.isActive) {
    throw new Error(`Agent already approved: ${agentAddress}`);
  }

  // If previously revoked, reactivate
  if (existing && !existing.isActive) {
    const updated = await prisma.approvedAgent.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        revokedAt: null,
        agentName: params.agentName ?? existing.agentName,
        agentTier: params.agentTier ?? existing.agentTier,
        agentType: params.agentType ?? existing.agentType,
        maxDailyBudget: params.maxDailyBudget ?? existing.maxDailyBudget,
        approvedBy: params.approvedBy,
        approvedAt: new Date(),
        lastValidated: new Date(),
      },
    });

    logger.info('[ApprovedAgentService] Reactivated agent', {
      protocolId: params.protocolId,
      agentAddress,
      id: updated.id,
    });

    return updated;
  }

  // Create new agent
  const agent = await prisma.approvedAgent.create({
    data: {
      protocolId: params.protocolId,
      agentAddress,
      agentName: params.agentName,
      agentTier: params.agentTier ?? 3,
      agentType: params.agentType ?? AgentType.UNKNOWN,
      tierOverride: false,
      maxDailyBudget: params.maxDailyBudget ?? 10,
      isActive: true,
      approvedBy: params.approvedBy,
      lastValidated: new Date(),
    },
  });

  logger.info('[ApprovedAgentService] Created approved agent', {
    protocolId: params.protocolId,
    agentAddress,
    id: agent.id,
    agentTier: agent.agentTier,
  });

  return agent;
}

/**
 * Update an approved agent
 */
export async function updateApprovedAgent(
  params: UpdateApprovedAgentParams
): Promise<ApprovedAgentDetails> {
  const prisma = getPrisma();

  const agentAddress = params.agentAddress.toLowerCase();

  const existing = await prisma.approvedAgent.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
  });

  if (!existing) {
    throw new Error(`Agent not found: ${agentAddress}`);
  }

  if (!existing.isActive) {
    throw new Error(`Agent is not active: ${agentAddress}`);
  }

  const updateData: Record<string, unknown> = {};

  if (params.updates.agentName !== undefined) {
    updateData.agentName = params.updates.agentName;
  }

  if (params.updates.agentTier !== undefined) {
    updateData.agentTier = params.updates.agentTier;
    updateData.tierOverride = true;
  }

  if (params.updates.agentType !== undefined) {
    updateData.agentType = params.updates.agentType;
  }

  if (params.updates.tierOverride !== undefined) {
    updateData.tierOverride = params.updates.tierOverride;
  }

  if (params.updates.maxDailyBudget !== undefined) {
    updateData.maxDailyBudget = params.updates.maxDailyBudget;
  }

  if (params.updates.isActive !== undefined) {
    updateData.isActive = params.updates.isActive;
    if (!params.updates.isActive) {
      updateData.revokedAt = new Date();
    }
  }

  updateData.lastValidated = new Date();

  const updated = await prisma.approvedAgent.update({
    where: { id: existing.id },
    data: updateData,
  });

  logger.info('[ApprovedAgentService] Updated approved agent', {
    protocolId: params.protocolId,
    agentAddress,
    updates: Object.keys(params.updates),
  });

  return updated;
}

/**
 * Soft-delete (revoke) an approved agent
 */
export async function deleteApprovedAgent(params: {
  protocolId: string;
  agentAddress: string;
}): Promise<void> {
  const prisma = getPrisma();

  const agentAddress = params.agentAddress.toLowerCase();

  const existing = await prisma.approvedAgent.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
  });

  if (!existing) {
    throw new Error(`Agent not found: ${agentAddress}`);
  }

  if (!existing.isActive) {
    // Already revoked, nothing to do
    return;
  }

  await prisma.approvedAgent.update({
    where: { id: existing.id },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  logger.info('[ApprovedAgentService] Revoked approved agent', {
    protocolId: params.protocolId,
    agentAddress,
  });
}

/**
 * Get a single approved agent
 */
export async function getApprovedAgent(
  protocolId: string,
  agentAddress: string
): Promise<ApprovedAgentDetails | null> {
  const prisma = getPrisma();

  return prisma.approvedAgent.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId,
        agentAddress: agentAddress.toLowerCase(),
      },
    },
  });
}

/**
 * List approved agents for a protocol
 */
export async function listApprovedAgents(
  protocolId: string,
  options?: {
    active?: boolean;
    tier?: number;
    limit?: number;
    offset?: number;
  }
): Promise<ApprovedAgentDetails[]> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = { protocolId };

  if (options?.active !== undefined) {
    where.isActive = options.active;
  }

  if (options?.tier !== undefined) {
    where.agentTier = options.tier;
  }

  return prisma.approvedAgent.findMany({
    where,
    orderBy: [
      { agentTier: 'asc' },
      { approvedAt: 'desc' },
    ],
    take: options?.limit ?? 100,
    skip: options?.offset ?? 0,
  });
}

/**
 * Count approved agents for a protocol
 */
export async function countApprovedAgents(
  protocolId: string,
  options?: { active?: boolean; tier?: number }
): Promise<number> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = { protocolId };

  if (options?.active !== undefined) {
    where.isActive = options.active;
  }

  if (options?.tier !== undefined) {
    where.agentTier = options.tier;
  }

  return prisma.approvedAgent.count({ where });
}

/**
 * Format agent details for display
 */
export function formatAgentDetails(agent: ApprovedAgentDetails): string {
  const tierLabel =
    agent.agentTier === 1 ? 'ERC-8004 (Tier 1)' :
    agent.agentTier === 2 ? 'ERC-4337 (Tier 2)' :
    'Smart Contract (Tier 3)';

  const statusLabel = agent.isActive ? 'Active' : 'Revoked';
  const overrideLabel = agent.tierOverride ? ' (override)' : '';

  const lines = [
    `Agent: ${agent.agentAddress.slice(0, 10)}...${agent.agentAddress.slice(-8)}`,
    `Name: ${agent.agentName ?? 'N/A'}`,
    `Tier: ${tierLabel}${overrideLabel}`,
    `Type: ${agent.agentType}`,
    `Max Daily Budget: $${agent.maxDailyBudget}`,
    `Status: ${statusLabel}`,
    `Approved By: ${agent.approvedBy}`,
    `Approved At: ${agent.approvedAt.toISOString().split('T')[0]}`,
  ];

  if (agent.revokedAt) {
    lines.push(`Revoked At: ${agent.revokedAt.toISOString().split('T')[0]}`);
  }

  return lines.join('\n');
}

/**
 * Format agent list for display
 */
export function formatAgentList(agents: ApprovedAgentDetails[]): string {
  if (agents.length === 0) {
    return 'No approved agents found.';
  }

  const lines = [`Approved Agents (${agents.length}):`];

  for (const agent of agents) {
    const tier = `T${agent.agentTier}`;
    const status = agent.isActive ? '' : ' [revoked]';
    const name = agent.agentName ? ` "${agent.agentName}"` : '';
    lines.push(
      `  ${tier} ${agent.agentAddress.slice(0, 10)}...${name}${status}`
    );
  }

  return lines.join('\n');
}
