/**
 * Aegis Cache Module
 *
 * High-performance Redis caching layer designed for 1000 txs/day scale.
 *
 * Features:
 * - Type-safe cache operations
 * - Multiple caching strategies (write-through, read-through, cache-aside)
 * - Automatic cache warmup
 * - Batch operations for efficiency
 * - Comprehensive metrics
 *
 * Usage:
 * ```typescript
 * import { initializeCache, getCachedProtocolBudget } from '@/lib/cache';
 *
 * // At startup
 * await initializeCache();
 *
 * // In application
 * const budget = await getCachedProtocolBudget('uniswap-v3');
 * ```
 */

import { getCache, RedisCache, isCacheEnabled } from './redis-cache';
import {
  WriteThroughStrategy,
  ReadThroughStrategy,
  CacheAsideStrategy,
  BatchCacheOperations,
  CacheKeys,
  handleCacheInvalidation,
  type CacheInvalidationEvent,
} from './cache-strategies';
import { logger } from '../logger';
import { getPrisma } from '../db';

// Strategy instances (initialized in initializeCache)
let protocolBudgetStrategy: WriteThroughStrategy<{ balanceUSD: number; totalSpent: number }> | null =
  null;
let protocolWhitelistStrategy: ReadThroughStrategy<string[]> | null = null;
let agentReservesStrategy: CacheAsideStrategy<{ ETH: number; USDC: number; chainId: number }> | null =
  null;
let batchOps: BatchCacheOperations | null = null;

/**
 * Initialize cache layer.
 * MUST be called at application startup before using cache functions.
 *
 * @param options Initialization options
 */
export async function initializeCache(options?: {
  skipWarmup?: boolean;
  skipConnection?: boolean;
}): Promise<void> {
  if (!isCacheEnabled()) {
    logger.warn('[Cache] Cache is disabled, skipping initialization');
    return;
  }

  try {
    const cache = getCache();

    // Connect to Redis
    if (!options?.skipConnection) {
      await cache.connect();
      logger.info('[Cache] Connected to Redis');
    }

    // Initialize strategies
    protocolBudgetStrategy = new WriteThroughStrategy(cache, 60000); // 60s TTL
    protocolWhitelistStrategy = new ReadThroughStrategy(cache, 300000); // 5min TTL
    agentReservesStrategy = new CacheAsideStrategy(cache, 30000); // 30s TTL
    batchOps = new BatchCacheOperations(cache);

    // Warmup cache with frequently accessed data
    if (!options?.skipWarmup) {
      await warmupCache();
    }

    logger.info('[Cache] Initialized successfully', {
      enabled: true,
      hitRate: cache.getHitRate(),
    });
  } catch (error) {
    logger.error('[Cache] Initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - allow application to continue without cache
  }
}

/**
 * Warmup cache with active protocols and frequently accessed data.
 */
async function warmupCache(): Promise<void> {
  if (!batchOps) {
    logger.warn('[Cache] Cannot warmup - batch operations not initialized');
    return;
  }

  try {
    const db = getPrisma();
    const startTime = Date.now();

    // Load all active protocols with budget > 0
    const protocols = await db.protocolSponsor.findMany({
      where: {
        balanceUSD: { gt: 0 },
      },
      select: {
        protocolId: true,
        balanceUSD: true,
        totalSpent: true,
        whitelistedContracts: true,
      },
    });

    if (protocols.length === 0) {
      logger.info('[Cache] No active protocols to warmup');
      return;
    }

    // Warmup protocol budgets
    const budgetData = new Map<string, { balanceUSD: number; totalSpent: number }>();
    for (const p of protocols) {
      budgetData.set(CacheKeys.protocolBudget(p.protocolId), {
        balanceUSD: p.balanceUSD,
        totalSpent: p.totalSpent,
      });
    }

    // Warmup whitelists
    const whitelistData = new Map<string, string[]>();
    for (const p of protocols) {
      whitelistData.set(CacheKeys.protocolWhitelist(p.protocolId), p.whitelistedContracts);
    }

    // Execute warmup
    await Promise.all([
      batchOps.warmup(budgetData, 60000),
      batchOps.warmup(whitelistData, 300000),
    ]);

    const elapsed = Date.now() - startTime;
    logger.info('[Cache] Warmup completed', {
      protocols: protocols.length,
      budgets: budgetData.size,
      whitelists: whitelistData.size,
      elapsedMs: elapsed,
    });
  } catch (error) {
    logger.warn('[Cache] Warmup failed (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get protocol budget with caching (write-through strategy).
 *
 * @param protocolId Protocol ID
 * @returns Budget data or null if not found
 */
export async function getCachedProtocolBudget(
  protocolId: string
): Promise<{ balanceUSD: number; totalSpent: number } | null> {
  if (!protocolBudgetStrategy) {
    // Fallback to direct database query if cache not initialized
    return await getProtocolBudgetFromDb(protocolId);
  }

  return await protocolBudgetStrategy.get(CacheKeys.protocolBudget(protocolId), async () => {
    return await getProtocolBudgetFromDb(protocolId);
  });
}

/**
 * Update protocol budget after sponsorship (write-through).
 *
 * @param protocolId Protocol ID
 * @param newBalanceUSD Updated balance
 * @param costUSD Cost of sponsorship
 */
export async function updateCachedProtocolBudget(
  protocolId: string,
  newBalanceUSD: number,
  costUSD: number
): Promise<void> {
  if (!protocolBudgetStrategy) {
    return;
  }

  try {
    // Update database first
    const db = getPrisma();
    await db.protocolSponsor.update({
      where: { protocolId },
      data: {
        balanceUSD: newBalanceUSD,
        totalSpent: { increment: costUSD },
      },
    });

    // Update cache (write-through)
    const currentBudget = await getCachedProtocolBudget(protocolId);
    if (currentBudget) {
      await protocolBudgetStrategy.set(CacheKeys.protocolBudget(protocolId), {
        balanceUSD: newBalanceUSD,
        totalSpent: currentBudget.totalSpent + costUSD,
      });
    }

    // Emit invalidation event
    await handleCacheInvalidation(
      {
        type: 'PROTOCOL_BUDGET_UPDATED',
        protocolId,
      },
      getCache()
    );

    logger.debug('[Cache] Updated protocol budget', {
      protocolId,
      newBalanceUSD,
      costUSD,
    });
  } catch (error) {
    logger.error('[Cache] Failed to update protocol budget', {
      protocolId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get protocol whitelist with caching (read-through strategy).
 *
 * @param protocolId Protocol ID
 * @returns Array of whitelisted contract addresses
 */
export async function getCachedProtocolWhitelist(protocolId: string): Promise<string[]> {
  if (!protocolWhitelistStrategy) {
    return await getProtocolWhitelistFromDb(protocolId);
  }

  const result = await protocolWhitelistStrategy.get(
    CacheKeys.protocolWhitelist(protocolId),
    async () => {
      return await getProtocolWhitelistFromDb(protocolId);
    }
  );

  return result ?? [];
}

/**
 * Get agent reserves with caching (cache-aside strategy).
 *
 * @returns Agent reserves (ETH, USDC, chainId)
 */
export async function getCachedAgentReserves(): Promise<{
  ETH: number;
  USDC: number;
  chainId: number;
} | null> {
  if (!agentReservesStrategy) {
    return null;
  }

  return await agentReservesStrategy.get(CacheKeys.agentReserves(), async () => {
    // This would be loaded from blockchain or state-store
    // For now, return null to force refresh
    return null;
  });
}

/**
 * Set agent reserves in cache (cache-aside strategy).
 *
 * @param reserves Reserve balances
 */
export async function setCachedAgentReserves(reserves: {
  ETH: number;
  USDC: number;
  chainId: number;
}): Promise<void> {
  if (!agentReservesStrategy) {
    return;
  }

  await agentReservesStrategy.set(CacheKeys.agentReserves(), reserves);
}

/**
 * Batch get multiple protocol budgets (optimized).
 *
 * @param protocolIds Array of protocol IDs
 * @returns Map of protocolId -> budget
 */
export async function getCachedProtocolBudgets(
  protocolIds: string[]
): Promise<Map<string, { balanceUSD: number; totalSpent: number }>> {
  if (!batchOps) {
    // Fallback to sequential queries
    const result = new Map<string, { balanceUSD: number; totalSpent: number }>();
    for (const id of protocolIds) {
      const budget = await getCachedProtocolBudget(id);
      if (budget) {
        result.set(id, budget);
      }
    }
    return result;
  }

  return await batchOps.getProtocolBudgets(protocolIds, async (missingIds) => {
    const db = getPrisma();
    const protocols = await db.protocolSponsor.findMany({
      where: {
        protocolId: { in: missingIds },
      },
      select: {
        protocolId: true,
        balanceUSD: true,
        totalSpent: true,
      },
    });

    const result = new Map<string, { balanceUSD: number; totalSpent: number }>();
    for (const p of protocols) {
      result.set(p.protocolId, {
        balanceUSD: p.balanceUSD,
        totalSpent: p.totalSpent,
      });
    }
    return result;
  });
}

/**
 * Invalidate all cache entries for a protocol.
 *
 * @param protocolId Protocol ID
 */
export async function invalidateProtocolCache(protocolId: string): Promise<void> {
  if (!batchOps) {
    return;
  }

  await batchOps.invalidateProtocol(protocolId);
  logger.debug('[Cache] Invalidated protocol cache', { protocolId });
}

/**
 * Get cache metrics for monitoring.
 */
export function getCacheMetrics() {
  const cache = getCache();
  return {
    ...cache.getMetrics(),
    hitRate: cache.getHitRate(),
    enabled: isCacheEnabled(),
    connected: cache.isConnected(),
  };
}

/**
 * Shutdown cache gracefully.
 */
export async function shutdownCache(): Promise<void> {
  try {
    const cache = getCache();
    await cache.disconnect();
    logger.info('[Cache] Shutdown complete');
  } catch (error) {
    logger.error('[Cache] Shutdown error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Helper functions for database fallbacks

async function getProtocolBudgetFromDb(
  protocolId: string
): Promise<{ balanceUSD: number; totalSpent: number } | null> {
  try {
    const db = getPrisma();
    const proto = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: {
        balanceUSD: true,
        totalSpent: true,
      },
    });

    return proto ? { balanceUSD: proto.balanceUSD, totalSpent: proto.totalSpent } : null;
  } catch (error) {
    logger.error('[Cache] Database query failed', {
      protocolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getProtocolWhitelistFromDb(protocolId: string): Promise<string[]> {
  try {
    const db = getPrisma();
    const proto = await db.protocolSponsor.findUnique({
      where: { protocolId },
      select: {
        whitelistedContracts: true,
      },
    });

    return proto?.whitelistedContracts ?? [];
  } catch (error) {
    logger.error('[Cache] Database query failed', {
      protocolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// Re-export for convenience
export { getCache, RedisCache, isCacheEnabled } from './redis-cache';
export { CacheKeys, handleCacheInvalidation, type CacheInvalidationEvent } from './cache-strategies';
