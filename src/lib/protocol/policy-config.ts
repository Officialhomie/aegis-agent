/**
 * Aegis Runtime Policy Configuration
 *
 * Loads and merges policy configuration from multiple sources:
 * Precedence (highest to lowest):
 * 1. Runtime overrides (Phase 2 OpenClaw commands)
 * 2. Policy config (Phase 1 onboarding settings)
 * 3. Environment variables (defaults)
 */

import { getPrisma } from '../db';
import { getConfigNumber } from '../config';
import { logger } from '../logger';

export interface PolicyConfig {
  dailyBudgetUSD?: number;
  gasPriceMaxGwei?: number;
  maxSponsorshipsPerDay?: number;
  whitelistedContracts?: string[];
  blacklistedWallets?: string[];
}

/**
 * Get protocol's policy configuration from database
 */
export async function getProtocolPolicyConfig(
  protocolId: string
): Promise<PolicyConfig | null> {
  const db = getPrisma();

  try {
    const protocol = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: { policyConfig: true },
    });

    if (!protocol || !protocol.policyConfig) {
      return null;
    }

    // Parse JSON policy config
    const config = protocol.policyConfig as PolicyConfig;
    return config;
  } catch (err) {
    logger.error('[PolicyConfig] Failed to load policy config', {
      protocolId,
      error: err,
    });
    return null;
  }
}

/**
 * Update protocol's policy configuration
 */
export async function updateProtocolPolicyConfig(
  protocolId: string,
  updates: Partial<PolicyConfig>
): Promise<void> {
  const db = getPrisma();

  try {
    // Get existing config
    const protocol = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: { policyConfig: true },
    });

    const existingConfig = (protocol?.policyConfig as PolicyConfig) ?? {};

    // Merge updates
    const newConfig: PolicyConfig = {
      ...existingConfig,
      ...updates,
    };

    // Update in database
    await db.protocolSponsor.update({
      where: { protocolId },
      data: { policyConfig: newConfig },
    });

    logger.info('[PolicyConfig] Policy config updated', {
      protocolId,
      updates: Object.keys(updates),
    });
  } catch (err) {
    logger.error('[PolicyConfig] Failed to update policy config', {
      protocolId,
      error: err,
    });
    throw new Error(`Failed to update policy config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get effective policy value for a specific rule type
 *
 * Checks in order:
 * 1. Runtime overrides (TODO: Phase 2)
 * 2. Protocol policy config
 * 3. Environment variables
 */
export async function getEffectivePolicyValue(
  protocolId: string,
  ruleType: keyof PolicyConfig
): Promise<number | number[] | string[] | undefined> {
  // TODO: Phase 2 - Check runtime overrides first

  // Check protocol policy config
  const config = await getProtocolPolicyConfig(protocolId);
  if (config && config[ruleType] !== undefined) {
    logger.debug('[PolicyConfig] Using protocol policy config', {
      protocolId,
      ruleType,
      value: config[ruleType],
    });
    return config[ruleType];
  }

  // Fall back to environment variables
  switch (ruleType) {
    case 'dailyBudgetUSD':
      return getConfigNumber('MAX_SPONSORSHIP_COST_USD', 0.5, 0.01, 100);
    case 'gasPriceMaxGwei':
      return getConfigNumber('GAS_PRICE_MAX_GWEI', 2, 0.1, 1000);
    case 'maxSponsorshipsPerDay':
      return getConfigNumber('MAX_SPONSORSHIPS_PER_USER_DAY', 3, 1, 100);
    default:
      return undefined;
  }
}

/**
 * Get all policy overrides for a protocol
 */
export async function getPolicyOverrides(
  protocolId: string
): Promise<Array<{ ruleType: string; value: unknown; createdAt: Date; createdBy: string }>> {
  const db = getPrisma();

  try {
    const overrides = await db.policyOverride.findMany({
      where: { protocolId },
      orderBy: { createdAt: 'desc' },
    });

    return overrides.map((o) => ({
      ruleType: o.ruleType,
      value: o.overrideValue,
      createdAt: o.createdAt,
      createdBy: o.createdBy,
    }));
  } catch (err) {
    logger.error('[PolicyConfig] Failed to load policy overrides', {
      protocolId,
      error: err,
    });
    return [];
  }
}

/**
 * Create or update a policy override
 */
export async function setPolicyOverride(
  protocolId: string,
  ruleType: string,
  value: unknown,
  createdBy: string
): Promise<void> {
  const db = getPrisma();

  try {
    await db.policyOverride.upsert({
      where: {
        protocolId_ruleType: { protocolId, ruleType },
      },
      create: {
        protocolId,
        ruleType,
        overrideValue: value,
        createdBy,
      },
      update: {
        overrideValue: value,
        createdBy,
        createdAt: new Date(), // Update timestamp
      },
    });

    logger.info('[PolicyConfig] Policy override set', {
      protocolId,
      ruleType,
      createdBy,
    });
  } catch (err) {
    logger.error('[PolicyConfig] Failed to set policy override', {
      protocolId,
      ruleType,
      error: err,
    });
    throw new Error(`Failed to set policy override: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Delete a policy override
 */
export async function deletePolicyOverride(
  protocolId: string,
  ruleType: string
): Promise<void> {
  const db = getPrisma();

  try {
    await db.policyOverride.delete({
      where: {
        protocolId_ruleType: { protocolId, ruleType },
      },
    });

    logger.info('[PolicyConfig] Policy override deleted', {
      protocolId,
      ruleType,
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      // Record not found - already deleted
      return;
    }
    logger.error('[PolicyConfig] Failed to delete policy override', {
      protocolId,
      ruleType,
      error: err,
    });
    throw new Error(`Failed to delete policy override: ${err instanceof Error ? err.message : String(err)}`);
  }
}
