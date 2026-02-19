/**
 * Aegis Protocol Onboarding Workflow
 *
 * Handles the self-serve protocol onboarding flow:
 * 1. Registration → instant simulation mode access
 * 2. CDP allowlist submission (manual batch process)
 * 3. CDP approval → live mode enabled
 * 4. Event tracking throughout lifecycle
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import type { OnboardingStatus, CDPStatus } from '@prisma/client';

export interface ProtocolRegistrationData {
  protocolId: string;
  name: string;
  notificationEmail: string;
  notificationWebhook?: string;
  initialDepositTxHash: string;
  whitelistedContracts?: string[];
  estimatedMonthlyVolume: number;
}

export interface OnboardingStatusInfo {
  protocolId: string;
  onboardingStatus: OnboardingStatus;
  cdpAllowlistStatus: CDPStatus;
  canUseSimulation: boolean;
  simulationExpiresAt?: Date | null;
  isLive: boolean;
  nextAction?: string;
  events: Array<{
    eventType: string;
    eventData: unknown;
    createdAt: Date;
  }>;
}

/**
 * Register a new protocol and approve for simulation mode
 */
export async function registerProtocol(
  data: ProtocolRegistrationData,
  apiKeyHash: string
): Promise<{ protocolId: string; simulationModeUntil: Date }> {
  const db = getPrisma();
  const simulationModeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  try {
    // Create protocol sponsor with simulation mode access
    await db.protocolSponsor.create({
      data: {
        protocolId: data.protocolId,
        name: data.name,
        whitelistedContracts: data.whitelistedContracts ?? [],
        tier: 'bronze',
        balanceUSD: 0,
        totalSpent: 0,
        sponsorshipCount: 0,

        // Onboarding fields
        onboardingStatus: 'APPROVED_SIMULATION',
        cdpAllowlistStatus: 'NOT_SUBMITTED',
        simulationModeUntil,

        // Contact info
        notificationEmail: data.notificationEmail,
        notificationWebhook: data.notificationWebhook,

        // API key
        apiKeyHash,
        apiKeyCreatedAt: new Date(),

        // Create registration event
        onboardingEvents: {
          create: {
            eventType: 'REGISTERED',
            eventData: {
              depositTxHash: data.initialDepositTxHash,
              estimatedMonthlyVolume: data.estimatedMonthlyVolume,
            },
          },
        },
      },
    });

    logger.info('[Onboarding] Protocol registered', {
      protocolId: data.protocolId,
      simulationModeUntil,
    });

    return { protocolId: data.protocolId, simulationModeUntil };
  } catch (err) {
    logger.error('[Onboarding] Registration failed', {
      protocolId: data.protocolId,
      error: err,
    });
    throw new Error(`Failed to register protocol: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get protocol onboarding status
 */
export async function getOnboardingStatus(protocolId: string): Promise<OnboardingStatusInfo> {
  const db = getPrisma();

  const protocol = await db.protocolSponsor.findUnique({
    where: { protocolId },
    include: {
      onboardingEvents: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!protocol) {
    throw new Error(`Protocol ${protocolId} not found`);
  }

  const now = new Date();
  const canUseSimulation =
    protocol.onboardingStatus === 'APPROVED_SIMULATION' &&
    protocol.simulationModeUntil !== null &&
    protocol.simulationModeUntil > now;

  const isLive =
    protocol.onboardingStatus === 'LIVE' && protocol.cdpAllowlistStatus === 'APPROVED';

  let nextAction: string | undefined;
  if (!isLive && !canUseSimulation) {
    if (protocol.cdpAllowlistStatus === 'NOT_SUBMITTED') {
      nextAction = 'Awaiting CDP allowlist submission';
    } else if (protocol.cdpAllowlistStatus === 'SUBMITTED') {
      nextAction = 'Waiting for CDP approval (typically 5-7 days)';
    } else if (protocol.cdpAllowlistStatus === 'REJECTED') {
      nextAction = 'CDP allowlist rejected - contact support';
    }
  } else if (canUseSimulation) {
    nextAction = `Simulation mode active until ${protocol.simulationModeUntil?.toISOString()}`;
  }

  return {
    protocolId,
    onboardingStatus: protocol.onboardingStatus,
    cdpAllowlistStatus: protocol.cdpAllowlistStatus,
    canUseSimulation,
    simulationExpiresAt: protocol.simulationModeUntil,
    isLive,
    nextAction,
    events: protocol.onboardingEvents.map((e) => ({
      eventType: e.eventType,
      eventData: e.eventData,
      createdAt: e.createdAt,
    })),
  };
}

/**
 * Submit protocols to CDP allowlist (manual batch process)
 */
export async function submitToCDPAllowlist(protocolIds: string[]): Promise<void> {
  const db = getPrisma();

  try {
    // Update all protocols to SUBMITTED status
    await db.protocolSponsor.updateMany({
      where: {
        protocolId: { in: protocolIds },
        cdpAllowlistStatus: 'NOT_SUBMITTED',
      },
      data: {
        cdpAllowlistStatus: 'SUBMITTED',
        cdpAllowlistSubmittedAt: new Date(),
        onboardingStatus: 'PENDING_CDP',
      },
    });

    // Create events for each protocol
    for (const protocolId of protocolIds) {
      await db.onboardingEvent.create({
        data: {
          protocolId,
          eventType: 'CDP_SUBMITTED',
          eventData: { submittedAt: new Date().toISOString() },
        },
      });
    }

    logger.info('[Onboarding] Submitted to CDP allowlist', {
      count: protocolIds.length,
      protocolIds,
    });
  } catch (err) {
    logger.error('[Onboarding] CDP submission failed', { error: err });
    throw new Error(`Failed to submit to CDP: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Mark protocols as CDP-approved and transition to live mode
 */
export async function markCDPApproved(protocolIds: string[]): Promise<void> {
  const db = getPrisma();

  try {
    // Update all protocols to APPROVED status
    await db.protocolSponsor.updateMany({
      where: {
        protocolId: { in: protocolIds },
        cdpAllowlistStatus: 'SUBMITTED',
      },
      data: {
        cdpAllowlistStatus: 'APPROVED',
        cdpAllowlistApprovedAt: new Date(),
        onboardingStatus: 'LIVE',
      },
    });

    // Create events and send notifications
    for (const protocolId of protocolIds) {
      await db.onboardingEvent.create({
        data: {
          protocolId,
          eventType: 'CDP_APPROVED',
          eventData: { approvedAt: new Date().toISOString() },
        },
      });

      // TODO: Send notification email/webhook to protocol
    }

    logger.info('[Onboarding] Marked CDP approved', {
      count: protocolIds.length,
      protocolIds,
    });
  } catch (err) {
    logger.error('[Onboarding] CDP approval failed', { error: err });
    throw new Error(`Failed to mark CDP approved: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Check if protocol can execute sponsorships
 */
export async function canExecuteSponsorship(
  protocolId: string
): Promise<{ allowed: boolean; mode: 'LIVE' | 'SIMULATION' | null; reason?: string }> {
  const db = getPrisma();

  const protocol = await db.protocolSponsor.findUnique({
    where: { protocolId },
    select: {
      onboardingStatus: true,
      cdpAllowlistStatus: true,
      simulationModeUntil: true,
    },
  });

  if (!protocol) {
    return { allowed: false, mode: null, reason: 'Protocol not found' };
  }

  // Check if live mode
  if (
    protocol.onboardingStatus === 'LIVE' &&
    protocol.cdpAllowlistStatus === 'APPROVED'
  ) {
    return { allowed: true, mode: 'LIVE' };
  }

  // Check if simulation mode is valid
  const now = new Date();
  if (
    protocol.onboardingStatus === 'APPROVED_SIMULATION' &&
    protocol.simulationModeUntil &&
    protocol.simulationModeUntil > now
  ) {
    return { allowed: true, mode: 'SIMULATION' };
  }

  // Suspended or expired simulation
  if (protocol.onboardingStatus === 'SUSPENDED') {
    return { allowed: false, mode: null, reason: 'Protocol suspended' };
  }

  return {
    allowed: false,
    mode: null,
    reason: 'Simulation mode expired and not yet CDP approved',
  };
}

/**
 * Record first sponsorship event
 */
export async function recordFirstSponsorship(protocolId: string): Promise<void> {
  const db = getPrisma();

  try {
    // Check if first sponsorship event already exists
    const existingEvent = await db.onboardingEvent.findFirst({
      where: {
        protocolId,
        eventType: 'FIRST_SPONSORSHIP',
      },
    });

    if (!existingEvent) {
      await db.onboardingEvent.create({
        data: {
          protocolId,
          eventType: 'FIRST_SPONSORSHIP',
          eventData: { timestamp: new Date().toISOString() },
        },
      });

      logger.info('[Onboarding] First sponsorship recorded', { protocolId });
    }
  } catch (err) {
    logger.error('[Onboarding] Failed to record first sponsorship', {
      protocolId,
      error: err,
    });
  }
}
