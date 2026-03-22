/**
 * Aegis Protocol Onboarding Workflow
 *
 * Handles the self-serve protocol onboarding flow:
 * 1. Registration → instant simulation mode access
 * 2. Sovereign paymaster → live mode enabled immediately
 * 3. Event tracking throughout lifecycle
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import type { OnboardingStatus } from '@prisma/client';

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

  const isLive = protocol.onboardingStatus === 'LIVE';

  let nextAction: string | undefined;
  if (!isLive && !canUseSimulation) {
    nextAction = 'Simulation mode expired - contact support to go live';
  } else if (canUseSimulation) {
    nextAction = `Simulation mode active until ${protocol.simulationModeUntil?.toISOString()}`;
  }

  return {
    protocolId,
    onboardingStatus: protocol.onboardingStatus,
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
      simulationModeUntil: true,
    },
  });

  if (!protocol) {
    return { allowed: false, mode: null, reason: 'Protocol not found' };
  }

  // Sovereign paymaster mode: when Aegis paymaster env vars are configured,
  // Aegis owns the paymaster contract and signs its own approvals on-chain.
  // Any non-suspended protocol gets LIVE mode immediately.
  const sovereignPaymaster = !!(
    process.env.AEGIS_PAYMASTER_ADDRESS?.trim() &&
    process.env.AEGIS_PAYMASTER_SIGNING_KEY?.trim()
  );
  if (sovereignPaymaster && protocol.onboardingStatus !== 'SUSPENDED') {
    return { allowed: true, mode: 'LIVE' };
  }

  // Check if live mode
  if (protocol.onboardingStatus === 'LIVE') {
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
    reason: 'Simulation mode expired and not live',
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
