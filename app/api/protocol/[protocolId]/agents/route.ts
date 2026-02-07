/**
 * Agent Approval Management API
 *
 * Manages which agents are approved to receive sponsorship from a protocol.
 *
 * Endpoints:
 * - GET /api/protocol/[protocolId]/agents - List approved agents
 * - POST /api/protocol/[protocolId]/agents - Approve a new agent
 * - DELETE /api/protocol/[protocolId]/agents?agentAddress=0x... - Revoke agent
 * - PATCH /api/protocol/[protocolId]/agents - Update agent settings
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { z } from 'zod';
import { verifyApiAuth } from '@/src/lib/auth/api-auth';
import { logger } from '@/src/lib/logger';

const prisma = getPrisma();

// Validation schemas
const ApproveAgentSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  agentName: z.string().min(1).max(64).optional(),
  approvedBy: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid approver address'),
  maxDailyBudget: z.number().min(0).max(10000).optional().default(10),
});

const UpdateAgentSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  agentName: z.string().min(1).max(64).optional(),
  maxDailyBudget: z.number().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET - List approved agents for a protocol.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const agentAddress = searchParams.get('agentAddress');

    // Verify protocol exists
    const protocol = await prisma.protocolSponsor.findUnique({
      where: { protocolId },
      select: { protocolId: true, name: true, tier: true },
    });

    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocol not found', protocolId },
        { status: 404 }
      );
    }

    // Build query
    const where: {
      protocolId: string;
      isActive?: boolean;
      agentAddress?: string;
    } = { protocolId };

    if (!includeInactive) {
      where.isActive = true;
    }

    if (agentAddress) {
      where.agentAddress = agentAddress.toLowerCase();
    }

    const agents = await prisma.approvedAgent.findMany({
      where,
      orderBy: { approvedAt: 'desc' },
      select: {
        id: true,
        agentAddress: true,
        agentName: true,
        approvedBy: true,
        approvedAt: true,
        revokedAt: true,
        maxDailyBudget: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      protocolId,
      protocolName: protocol.name,
      tier: protocol.tier,
      agents,
      count: agents.length,
      activeCount: agents.filter((a) => a.isActive).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AgentsAPI] Failed to list agents', { error: message });

    return NextResponse.json(
      { error: 'Failed to list agents', message },
      { status: 500 }
    );
  }
}

/**
 * POST - Approve a new agent for sponsorship.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = ApproveAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { agentAddress, agentName, approvedBy, maxDailyBudget } = parsed.data;
    const normalizedAddress = agentAddress.toLowerCase();

    // Verify protocol exists
    const protocol = await prisma.protocolSponsor.findUnique({
      where: { protocolId },
    });

    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocol not found', protocolId },
        { status: 404 }
      );
    }

    // Check if agent already approved
    const existing = await prisma.approvedAgent.findUnique({
      where: {
        protocolId_agentAddress: {
          protocolId,
          agentAddress: normalizedAddress,
        },
      },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          {
            error: 'Agent already approved',
            agentAddress: normalizedAddress,
            protocolId,
            existingApproval: {
              approvedAt: existing.approvedAt,
              approvedBy: existing.approvedBy,
            },
          },
          { status: 409 }
        );
      }

      // Reactivate previously revoked agent
      const reactivated = await prisma.approvedAgent.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          approvedBy: approvedBy.toLowerCase(),
          approvedAt: new Date(),
          revokedAt: null,
          agentName: agentName ?? existing.agentName,
          maxDailyBudget: maxDailyBudget ?? existing.maxDailyBudget,
        },
      });

      logger.info('[AgentsAPI] Agent reactivated', {
        protocolId,
        agentAddress: normalizedAddress,
        approvedBy: approvedBy.toLowerCase(),
      });

      return NextResponse.json({
        success: true,
        action: 'reactivated',
        agent: {
          id: reactivated.id,
          agentAddress: reactivated.agentAddress,
          agentName: reactivated.agentName,
          approvedBy: reactivated.approvedBy,
          approvedAt: reactivated.approvedAt,
          maxDailyBudget: reactivated.maxDailyBudget,
          isActive: reactivated.isActive,
        },
        protocolId,
      });
    }

    // Create new approval
    const agent = await prisma.approvedAgent.create({
      data: {
        protocolId,
        agentAddress: normalizedAddress,
        agentName,
        approvedBy: approvedBy.toLowerCase(),
        maxDailyBudget,
        isActive: true,
      },
    });

    logger.info('[AgentsAPI] Agent approved', {
      protocolId,
      agentAddress: normalizedAddress,
      approvedBy: approvedBy.toLowerCase(),
      maxDailyBudget,
    });

    return NextResponse.json({
      success: true,
      action: 'approved',
      agent: {
        id: agent.id,
        agentAddress: agent.agentAddress,
        agentName: agent.agentName,
        approvedBy: agent.approvedBy,
        approvedAt: agent.approvedAt,
        maxDailyBudget: agent.maxDailyBudget,
        isActive: agent.isActive,
      },
      protocolId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AgentsAPI] Failed to approve agent', { error: message });

    return NextResponse.json(
      { error: 'Failed to approve agent', message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Revoke an agent's approval.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const { searchParams } = new URL(request.url);
    const agentAddress = searchParams.get('agentAddress');

    if (!agentAddress) {
      return NextResponse.json(
        { error: 'Missing agentAddress query parameter' },
        { status: 400 }
      );
    }

    const normalizedAddress = agentAddress.toLowerCase();

    // Find existing approval
    const existing = await prisma.approvedAgent.findUnique({
      where: {
        protocolId_agentAddress: {
          protocolId,
          agentAddress: normalizedAddress,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Agent not found', agentAddress: normalizedAddress, protocolId },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        {
          error: 'Agent already revoked',
          agentAddress: normalizedAddress,
          revokedAt: existing.revokedAt,
        },
        { status: 409 }
      );
    }

    // Revoke the agent
    const revoked = await prisma.approvedAgent.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    logger.info('[AgentsAPI] Agent revoked', {
      protocolId,
      agentAddress: normalizedAddress,
    });

    return NextResponse.json({
      success: true,
      action: 'revoked',
      agent: {
        id: revoked.id,
        agentAddress: revoked.agentAddress,
        agentName: revoked.agentName,
        revokedAt: revoked.revokedAt,
        isActive: revoked.isActive,
      },
      protocolId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AgentsAPI] Failed to revoke agent', { error: message });

    return NextResponse.json(
      { error: 'Failed to revoke agent', message },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update an approved agent's settings.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ protocolId: string }> }
) {
  const authResult = verifyApiAuth(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  try {
    const { protocolId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = UpdateAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { agentAddress, agentName, maxDailyBudget, isActive } = parsed.data;
    const normalizedAddress = agentAddress.toLowerCase();

    // Find existing approval
    const existing = await prisma.approvedAgent.findUnique({
      where: {
        protocolId_agentAddress: {
          protocolId,
          agentAddress: normalizedAddress,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Agent not found', agentAddress: normalizedAddress, protocolId },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: {
      agentName?: string;
      maxDailyBudget?: number;
      isActive?: boolean;
      revokedAt?: Date | null;
    } = {};

    if (agentName !== undefined) updateData.agentName = agentName;
    if (maxDailyBudget !== undefined) updateData.maxDailyBudget = maxDailyBudget;
    if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateData.revokedAt = isActive ? null : new Date();
    }

    const updated = await prisma.approvedAgent.update({
      where: { id: existing.id },
      data: updateData,
    });

    logger.info('[AgentsAPI] Agent updated', {
      protocolId,
      agentAddress: normalizedAddress,
      updates: Object.keys(updateData),
    });

    return NextResponse.json({
      success: true,
      action: 'updated',
      agent: {
        id: updated.id,
        agentAddress: updated.agentAddress,
        agentName: updated.agentName,
        approvedBy: updated.approvedBy,
        approvedAt: updated.approvedAt,
        revokedAt: updated.revokedAt,
        maxDailyBudget: updated.maxDailyBudget,
        isActive: updated.isActive,
      },
      protocolId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AgentsAPI] Failed to update agent', { error: message });

    return NextResponse.json(
      { error: 'Failed to update agent', message },
      { status: 500 }
    );
  }
}
