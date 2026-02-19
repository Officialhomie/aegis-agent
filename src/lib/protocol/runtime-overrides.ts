/**
 * Runtime Overrides Management
 *
 * CRUD operations for RuntimeOverride and BlockedWallet models.
 * Used by OpenClaw commands to apply temporary policy changes.
 */

import { getPrisma } from '@/src/lib/db';
import { logger } from '@/src/lib/logger';
import type { RuntimeOverrideType } from '@prisma/client';

const db = getPrisma();

export interface RuntimeOverrideData {
  protocolId: string;
  overrideType: RuntimeOverrideType;
  value: any; // JSON value
  expiresAt?: Date;
  createdBy: string;
}

export interface BlockedWalletData {
  protocolId: string;
  walletAddress: string;
  reason?: string;
  blockedBy: string;
}

/**
 * Create a runtime override
 * Deactivates any existing override of the same type for the protocol
 */
export async function createRuntimeOverride(
  data: RuntimeOverrideData
): Promise<{ id: string }> {
  try {
    // Deactivate existing override of same type
    await db.runtimeOverride.updateMany({
      where: {
        protocolId: data.protocolId,
        overrideType: data.overrideType,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // Create new override
    const override = await db.runtimeOverride.create({
      data: {
        protocolId: data.protocolId,
        overrideType: data.overrideType,
        value: data.value,
        expiresAt: data.expiresAt,
        createdBy: data.createdBy,
        isActive: true,
      },
    });

    logger.info('[RuntimeOverride] Created', {
      id: override.id,
      protocolId: data.protocolId,
      type: data.overrideType,
      expiresAt: data.expiresAt?.toISOString(),
    });

    return { id: override.id };
  } catch (error) {
    logger.error('[RuntimeOverride] Failed to create', { error, data });
    throw new Error('Failed to create runtime override');
  }
}

/**
 * Get active runtime override for a protocol by type
 * Returns null if no active override exists or if expired
 */
export async function getActiveRuntimeOverride(
  protocolId: string,
  overrideType: RuntimeOverrideType
): Promise<{ value: any; expiresAt: Date | null } | null> {
  try {
    const override = await db.runtimeOverride.findFirst({
      where: {
        protocolId,
        overrideType,
        isActive: true,
        OR: [
          { expiresAt: null }, // No expiration
          { expiresAt: { gt: new Date() } }, // Not expired yet
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!override) {
      return null;
    }

    return {
      value: override.value,
      expiresAt: override.expiresAt,
    };
  } catch (error) {
    logger.error('[RuntimeOverride] Failed to get active override', {
      error,
      protocolId,
      overrideType,
    });
    return null;
  }
}

/**
 * Get all active runtime overrides for a protocol
 */
export async function getAllActiveOverrides(protocolId: string): Promise<
  Array<{
    type: RuntimeOverrideType;
    value: any;
    expiresAt: Date | null;
    createdAt: Date;
  }>
> {
  try {
    const overrides = await db.runtimeOverride.findMany({
      where: {
        protocolId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return overrides.map((o) => ({
      type: o.overrideType,
      value: o.value,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    }));
  } catch (error) {
    logger.error('[RuntimeOverride] Failed to get all active overrides', {
      error,
      protocolId,
    });
    return [];
  }
}

/**
 * Deactivate a runtime override
 */
export async function deactivateRuntimeOverride(
  protocolId: string,
  overrideType: RuntimeOverrideType
): Promise<void> {
  try {
    await db.runtimeOverride.updateMany({
      where: {
        protocolId,
        overrideType,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    logger.info('[RuntimeOverride] Deactivated', {
      protocolId,
      overrideType,
    });
  } catch (error) {
    logger.error('[RuntimeOverride] Failed to deactivate', {
      error,
      protocolId,
      overrideType,
    });
    throw new Error('Failed to deactivate runtime override');
  }
}

/**
 * Cleanup expired runtime overrides
 * Should be run periodically
 */
export async function cleanupExpiredOverrides(): Promise<number> {
  try {
    const result = await db.runtimeOverride.updateMany({
      where: {
        isActive: true,
        expiresAt: {
          not: null,
          lt: new Date(),
        },
      },
      data: {
        isActive: false,
      },
    });

    if (result.count > 0) {
      logger.info('[RuntimeOverride] Cleaned up expired overrides', {
        count: result.count,
      });
    }

    return result.count;
  } catch (error) {
    logger.error('[RuntimeOverride] Failed to cleanup expired', { error });
    return 0;
  }
}

/**
 * Block a wallet address
 */
export async function blockWallet(data: BlockedWalletData): Promise<{ id: string }> {
  try {
    const blocked = await db.blockedWallet.upsert({
      where: {
        protocolId_walletAddress: {
          protocolId: data.protocolId,
          walletAddress: data.walletAddress.toLowerCase(),
        },
      },
      create: {
        protocolId: data.protocolId,
        walletAddress: data.walletAddress.toLowerCase(),
        reason: data.reason,
        blockedBy: data.blockedBy,
        isActive: true,
      },
      update: {
        isActive: true,
        reason: data.reason,
        blockedBy: data.blockedBy,
        blockedAt: new Date(),
      },
    });

    logger.info('[BlockedWallet] Wallet blocked', {
      id: blocked.id,
      protocolId: data.protocolId,
      wallet: data.walletAddress,
      reason: data.reason,
    });

    return { id: blocked.id };
  } catch (error) {
    logger.error('[BlockedWallet] Failed to block wallet', { error, data });
    throw new Error('Failed to block wallet');
  }
}

/**
 * Unblock a wallet address
 */
export async function unblockWallet(
  protocolId: string,
  walletAddress: string
): Promise<void> {
  try {
    await db.blockedWallet.updateMany({
      where: {
        protocolId,
        walletAddress: walletAddress.toLowerCase(),
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    logger.info('[BlockedWallet] Wallet unblocked', {
      protocolId,
      wallet: walletAddress,
    });
  } catch (error) {
    logger.error('[BlockedWallet] Failed to unblock wallet', {
      error,
      protocolId,
      walletAddress,
    });
    throw new Error('Failed to unblock wallet');
  }
}

/**
 * Check if a wallet is blocked
 */
export async function isWalletBlocked(
  protocolId: string,
  walletAddress: string
): Promise<boolean> {
  try {
    const blocked = await db.blockedWallet.findFirst({
      where: {
        protocolId,
        walletAddress: walletAddress.toLowerCase(),
        isActive: true,
      },
    });

    return blocked !== null;
  } catch (error) {
    logger.error('[BlockedWallet] Failed to check if wallet blocked', {
      error,
      protocolId,
      walletAddress,
    });
    return false;
  }
}

/**
 * Get all blocked wallets for a protocol
 */
export async function getBlockedWallets(protocolId: string): Promise<
  Array<{
    walletAddress: string;
    reason: string | null;
    blockedAt: Date;
    blockedBy: string;
  }>
> {
  try {
    const blocked = await db.blockedWallet.findMany({
      where: {
        protocolId,
        isActive: true,
      },
      orderBy: {
        blockedAt: 'desc',
      },
    });

    return blocked.map((b) => ({
      walletAddress: b.walletAddress,
      reason: b.reason,
      blockedAt: b.blockedAt,
      blockedBy: b.blockedBy,
    }));
  } catch (error) {
    logger.error('[BlockedWallet] Failed to get blocked wallets', {
      error,
      protocolId,
    });
    return [];
  }
}

// Periodic cleanup task: Run every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupExpiredOverrides().catch((err) => {
      logger.error('[RuntimeOverride] Cleanup task failed', { error: err });
    });
  }, 60 * 60 * 1000); // 1 hour
}
