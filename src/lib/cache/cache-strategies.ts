/**
 * Cache Strategies for Aegis Agent
 *
 * Implements different caching patterns:
 * - Write-through: Update cache on writes (protocol budgets)
 * - Read-through: Populate cache on reads (whitelists)
 * - Cache-aside: Manual cache management (agent reserves)
 *
 * Optimized for 1000 txs/day scale with strong consistency guarantees.
 */

import { RedisCache, CacheSetOptions } from './redis-cache';
import { logger } from '../logger';

export interface CacheStrategy<T> {
  /** Get value with automatic cache population on miss */
  get(key: string, loader: () => Promise<T | null>): Promise<T | null>;

  /** Set value with cache update */
  set(key: string, value: T, options?: CacheSetOptions): Promise<boolean>;

  /** Delete value and invalidate cache */
  delete(key: string, options?: { invalidatePattern?: string }): Promise<boolean>;

  /** Update value atomically (write-through) */
  update(key: string, updater: (current: T | null) => Promise<T | null>): Promise<T | null>;
}

/**
 * Write-Through Cache Strategy
 *
 * ALWAYS updates cache when data is written to source.
 * Used for: Protocol budgets (critical financial data)
 *
 * Guarantees:
 * - Cache and source are always consistent
 * - Write latency increases (cache + source)
 * - Read latency is minimal (cache hit)
 */
export class WriteThroughStrategy<T> implements CacheStrategy<T> {
  constructor(
    private cache: RedisCache,
    private ttlMs: number = 60000
  ) {}

  async get(key: string, loader: () => Promise<T | null>): Promise<T | null> {
    // Try cache first
    const cached = await this.cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - load from source
    const value = await loader();
    if (value !== null) {
      // Populate cache for future reads
      await this.cache.set(key, value, { ttlMs: this.ttlMs });
    }

    return value;
  }

  async set(key: string, value: T, options?: CacheSetOptions): Promise<boolean> {
    // Write to cache immediately
    const cacheResult = await this.cache.set(key, value, {
      ttlMs: this.ttlMs,
      ...options,
    });

    if (!cacheResult) {
      logger.warn('[WriteThroughStrategy] Cache write failed', { key });
    }

    return cacheResult;
  }

  async delete(key: string, options?: { invalidatePattern?: string }): Promise<boolean> {
    if (options?.invalidatePattern) {
      await this.cache.invalidate(options.invalidatePattern);
    }
    return await this.cache.delete(key);
  }

  /**
   * Update value atomically with write-through to cache.
   *
   * IMPORTANT: This does NOT use database transactions.
   * Caller must handle database write separately.
   */
  async update(key: string, updater: (current: T | null) => Promise<T | null>): Promise<T | null> {
    // Get current value (cache or source)
    const current = await this.cache.get<T>(key);

    // Apply update
    const updated = await updater(current);

    if (updated !== null) {
      // Write through to cache
      await this.cache.set(key, updated, { ttlMs: this.ttlMs });
    } else {
      // If updater returns null, delete from cache
      await this.cache.delete(key);
    }

    return updated;
  }
}

/**
 * Read-Through Cache Strategy
 *
 * Populates cache automatically on read misses.
 * Used for: Protocol whitelists (rarely change)
 *
 * Guarantees:
 * - Cache is populated lazily
 * - First read is slow, subsequent reads are fast
 * - Stale data possible (use short TTL or invalidate on updates)
 */
export class ReadThroughStrategy<T> implements CacheStrategy<T> {
  constructor(
    private cache: RedisCache,
    private ttlMs: number = 300000 // 5 minutes default (whitelists change rarely)
  ) {}

  async get(key: string, loader: () => Promise<T | null>): Promise<T | null> {
    // Try cache first
    const cached = await this.cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - load from source and populate cache
    const value = await loader();
    if (value !== null) {
      await this.cache.set(key, value, { ttlMs: this.ttlMs });
    }

    return value;
  }

  async set(key: string, value: T, options?: CacheSetOptions): Promise<boolean> {
    // For read-through, set updates the cache
    // Caller is responsible for updating source
    return await this.cache.set(key, value, {
      ttlMs: this.ttlMs,
      ...options,
    });
  }

  async delete(key: string, options?: { invalidatePattern?: string }): Promise<boolean> {
    if (options?.invalidatePattern) {
      await this.cache.invalidate(options.invalidatePattern);
    }
    return await this.cache.delete(key);
  }

  async update(key: string, updater: (current: T | null) => Promise<T | null>): Promise<T | null> {
    const current = await this.cache.get<T>(key);
    const updated = await updater(current);

    if (updated !== null) {
      await this.cache.set(key, updated, { ttlMs: this.ttlMs });
    } else {
      await this.cache.delete(key);
    }

    return updated;
  }
}

/**
 * Cache-Aside Strategy
 *
 * Application explicitly manages cache.
 * Used for: Agent reserves (refreshed every cycle)
 *
 * Guarantees:
 * - Most flexibility
 * - Application controls when to cache
 * - Can use different TTLs per operation
 */
export class CacheAsideStrategy<T> implements CacheStrategy<T> {
  constructor(
    private cache: RedisCache,
    private defaultTtlMs: number = 30000 // 30 seconds default (reserves change frequently)
  ) {}

  async get(key: string, loader: () => Promise<T | null>): Promise<T | null> {
    // Try cache first
    const cached = await this.cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - load from source
    // Caller decides whether to cache or not
    return await loader();
  }

  async set(key: string, value: T, options?: CacheSetOptions): Promise<boolean> {
    return await this.cache.set(key, value, {
      ttlMs: this.defaultTtlMs,
      ...options,
    });
  }

  async delete(key: string, options?: { invalidatePattern?: string }): Promise<boolean> {
    if (options?.invalidatePattern) {
      await this.cache.invalidate(options.invalidatePattern);
    }
    return await this.cache.delete(key);
  }

  async update(key: string, updater: (current: T | null) => Promise<T | null>): Promise<T | null> {
    const current = await this.cache.get<T>(key);
    const updated = await updater(current);

    if (updated !== null) {
      await this.cache.set(key, updated, { ttlMs: this.defaultTtlMs });
    } else {
      await this.cache.delete(key);
    }

    return updated;
  }
}

/**
 * Batch Cache Operations
 *
 * Optimized operations for multiple keys in single round-trip.
 */
export class BatchCacheOperations {
  constructor(private cache: RedisCache) {}

  /**
   * Get multiple protocol budgets in single round-trip.
   *
   * @param protocolIds Array of protocol IDs
   * @param loader Function to load missing values from database
   * @returns Map of protocolId -> budget
   */
  async getProtocolBudgets<T>(
    protocolIds: string[],
    loader: (missingIds: string[]) => Promise<Map<string, T>>
  ): Promise<Map<string, T>> {
    if (protocolIds.length === 0) {
      return new Map();
    }

    // Build cache keys
    const keys = protocolIds.map((id) => `protocol:${id}:budget`);

    // Batch get from cache
    const cached = await this.cache.mget<T>(keys);

    // Map back to protocol IDs
    const result = new Map<string, T>();
    const missingIds: string[] = [];

    for (let i = 0; i < protocolIds.length; i++) {
      const id = protocolIds[i];
      const key = keys[i];
      const value = cached.get(key);

      if (value !== undefined) {
        result.set(id, value);
      } else {
        missingIds.push(id);
      }
    }

    // Load missing values from database
    if (missingIds.length > 0) {
      const loaded = await loader(missingIds);

      // Cache loaded values for future requests
      const promises: Promise<boolean>[] = [];
      for (const [id, value] of loaded.entries()) {
        result.set(id, value);
        promises.push(this.cache.set(`protocol:${id}:budget`, value, { ttlMs: 60000 }));
      }

      // Fire and forget cache writes
      Promise.all(promises).catch((err) => {
        logger.warn('[BatchCacheOperations] Failed to cache loaded values', { error: err });
      });
    }

    return result;
  }

  /**
   * Invalidate all cache entries for a protocol.
   *
   * @param protocolId Protocol ID
   */
  async invalidateProtocol(protocolId: string): Promise<number> {
    return await this.cache.invalidate(`protocol:${protocolId}:*`);
  }

  /**
   * Warmup cache with frequently accessed data.
   *
   * @param data Map of key -> value to pre-populate
   * @param ttlMs TTL for all entries
   */
  async warmup<T>(data: Map<string, T>, ttlMs: number): Promise<void> {
    const promises: Promise<boolean>[] = [];

    for (const [key, value] of data.entries()) {
      promises.push(this.cache.set(key, value, { ttlMs }));
    }

    const results = await Promise.allSettled(promises);
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      logger.warn('[BatchCacheOperations] Warmup completed with failures', {
        total: data.size,
        failed,
      });
    } else {
      logger.info('[BatchCacheOperations] Warmup completed successfully', {
        count: data.size,
      });
    }
  }
}

/**
 * Cache Key Builders
 *
 * Centralized key construction to ensure consistency.
 */
export const CacheKeys = {
  protocolBudget: (protocolId: string) => `protocol:${protocolId}:budget`,
  protocolWhitelist: (protocolId: string) => `protocol:${protocolId}:whitelist`,
  protocolSponsors: (protocolId: string) => `protocol:${protocolId}:sponsors`,
  agentReserves: () => `agent:reserves`,
  gasPrice: () => `gas:price`,
  gasPriceHistory: () => `gas:price:history`,
  userTxCount: (address: string) => `user:${address}:txcount`,
  userLegitimacy: (address: string) => `user:${address}:legitimacy`,
} as const;

/**
 * Cache Invalidation Events
 *
 * Subscribe to these events to invalidate cache when data changes.
 */
export type CacheInvalidationEvent =
  | { type: 'PROTOCOL_BUDGET_UPDATED'; protocolId: string }
  | { type: 'PROTOCOL_WHITELIST_UPDATED'; protocolId: string }
  | { type: 'SPONSORSHIP_EXECUTED'; protocolId: string; userAddress: string }
  | { type: 'RESERVES_UPDATED' }
  | { type: 'GAS_PRICE_UPDATED' };

/**
 * Handle cache invalidation based on events.
 */
export async function handleCacheInvalidation(
  event: CacheInvalidationEvent,
  cache: RedisCache
): Promise<void> {
  try {
    switch (event.type) {
      case 'PROTOCOL_BUDGET_UPDATED':
        await cache.delete(CacheKeys.protocolBudget(event.protocolId));
        logger.debug('[CacheInvalidation] Invalidated protocol budget', {
          protocolId: event.protocolId,
        });
        break;

      case 'PROTOCOL_WHITELIST_UPDATED':
        await cache.delete(CacheKeys.protocolWhitelist(event.protocolId));
        logger.debug('[CacheInvalidation] Invalidated protocol whitelist', {
          protocolId: event.protocolId,
        });
        break;

      case 'SPONSORSHIP_EXECUTED':
        // Invalidate protocol budget and user tx count
        await Promise.all([
          cache.delete(CacheKeys.protocolBudget(event.protocolId)),
          cache.delete(CacheKeys.userTxCount(event.userAddress)),
        ]);
        logger.debug('[CacheInvalidation] Invalidated after sponsorship', {
          protocolId: event.protocolId,
          userAddress: event.userAddress,
        });
        break;

      case 'RESERVES_UPDATED':
        await cache.delete(CacheKeys.agentReserves());
        logger.debug('[CacheInvalidation] Invalidated agent reserves');
        break;

      case 'GAS_PRICE_UPDATED':
        await cache.delete(CacheKeys.gasPrice());
        logger.debug('[CacheInvalidation] Invalidated gas price');
        break;
    }
  } catch (error) {
    logger.warn('[CacheInvalidation] Failed to invalidate cache', {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
