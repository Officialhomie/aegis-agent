/**
 * Redis Caching Layer for Aegis Agent
 *
 * Provides type-safe, high-performance caching for:
 * - Protocol budgets
 * - Agent reserves
 * - Gas prices
 * - Whitelist data
 *
 * Designed for 1000 txs/day scale with <5ms read latency.
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../logger';

export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTTLMs: number;
  /** Key prefix for namespacing */
  keyPrefix: string;
  /** Enable compression for large values */
  enableCompression: boolean;
  /** Max retries on connection failure */
  maxRetries: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  version: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  lastError?: string;
}

export interface CacheSetOptions {
  /** TTL in milliseconds */
  ttlMs?: number;
  /** Only set if key doesn't exist */
  nx?: boolean;
  /** Only set if key exists */
  xx?: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTLMs: 60000, // 60 seconds
  keyPrefix: 'aegis:cache',
  enableCompression: false,
  maxRetries: 3,
  connectionTimeoutMs: 5000,
};

export class RedisCache {
  private client: RedisClientType | null = null;
  private config: CacheConfig;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };
  private connected = false;
  private connecting = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Redis connection.
   * IMPORTANT: This is idempotent - safe to call multiple times.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await this.waitForConnection();
      return;
    }

    this.connecting = true;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: this.config.connectionTimeoutMs,
          reconnectStrategy: (retries) => {
            if (retries > this.config.maxRetries) {
              logger.error('[RedisCache] Max retries exceeded, giving up');
              return new Error('Max retries exceeded');
            }
            // Exponential backoff: 100ms, 200ms, 400ms
            const delay = Math.min(100 * Math.pow(2, retries), 3000);
            logger.warn(`[RedisCache] Reconnecting in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          },
        },
      });

      this.client.on('error', (err) => {
        logger.error('[RedisCache] Redis client error', { error: err });
        this.metrics.errors++;
        this.metrics.lastError = err.message;
      });

      this.client.on('ready', () => {
        logger.info('[RedisCache] Redis connection ready');
        this.connected = true;
      });

      this.client.on('end', () => {
        logger.warn('[RedisCache] Redis connection closed');
        this.connected = false;
      });

      await this.client.connect();
      this.connected = true;
      this.connecting = false;

      logger.info('[RedisCache] Connected to Redis', {
        url: redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
        keyPrefix: this.config.keyPrefix,
      });
    } catch (error) {
      this.connecting = false;
      this.connected = false;
      logger.error('[RedisCache] Failed to connect to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Wait for ongoing connection attempt to complete.
   */
  private async waitForConnection(maxWaitMs = 10000): Promise<void> {
    const start = Date.now();
    while (this.connecting && Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!this.connected) {
      throw new Error('Redis connection timeout');
    }
  }

  /**
   * Check if connected to Redis.
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Get value from cache with type safety.
   *
   * @param key Cache key (will be prefixed)
   * @returns Cached value or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected()) {
      logger.warn('[RedisCache] Cache miss - not connected', { key });
      this.metrics.misses++;
      return null;
    }

    try {
      const fullKey = this.buildKey(key);
      const raw = await this.client!.get(fullKey);

      if (raw === null) {
        this.metrics.misses++;
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(raw);

      // Check expiration (defense in depth - Redis should handle this)
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.metrics.misses++;
        await this.delete(key); // Clean up expired entry
        return null;
      }

      this.metrics.hits++;
      return entry.data;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      logger.error('[RedisCache] Error getting from cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL.
   *
   * @param key Cache key (will be prefixed)
   * @param value Value to cache (must be JSON-serializable)
   * @param options Cache options (TTL, NX, XX)
   */
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<boolean> {
    if (!this.isConnected()) {
      logger.warn('[RedisCache] Cannot set - not connected', { key });
      return false;
    }

    try {
      const fullKey = this.buildKey(key);
      const ttlMs = options.ttlMs ?? this.config.defaultTTLMs;
      const expiresAt = Date.now() + ttlMs;

      const entry: CacheEntry<T> = {
        data: value,
        cachedAt: Date.now(),
        expiresAt,
        version: 1,
      };

      const raw = JSON.stringify(entry);

      const client = this.client;
      if (!client) return false;

      // Use Redis SET with options
      const args: Parameters<typeof client.set> = [
        fullKey,
        raw,
        {
          PX: ttlMs, // TTL in milliseconds
        },
      ];

      if (options.nx) {
        args[2] = { ...args[2], NX: true }; // Only set if not exists
      }
      if (options.xx) {
        args[2] = { ...args[2], XX: true }; // Only set if exists
      }

      const result = await client.set(...args);

      if (result === 'OK' || result === null) {
        this.metrics.sets++;
        return true;
      }

      return false;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      logger.error('[RedisCache] Error setting cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Delete value from cache.
   *
   * @param key Cache key (will be prefixed)
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key);
      const result = await this.client!.del(fullKey);
      this.metrics.deletes++;
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      logger.error('[RedisCache] Error deleting from cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Invalidate cache entries matching pattern.
   *
   * @param pattern Pattern to match (e.g., "protocol:*")
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const fullPattern = this.buildKey(pattern);
      const keys = await this.client!.keys(fullPattern);

      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client!.del(keys);
      this.metrics.deletes += keys.length;
      logger.info('[RedisCache] Invalidated cache entries', {
        pattern,
        count: result,
      });
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      logger.error('[RedisCache] Error invalidating cache', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get multiple values in a single round-trip (pipeline).
   *
   * @param keys Array of cache keys
   * @returns Map of key -> value (only includes found entries)
   */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    if (!this.isConnected() || keys.length === 0) {
      return new Map();
    }

    try {
      const fullKeys = keys.map((k) => this.buildKey(k));
      const results = await this.client!.mGet(fullKeys);

      const map = new Map<string, T>();

      for (let i = 0; i < keys.length; i++) {
        const raw = results[i];
        if (raw !== null) {
          try {
            const entry: CacheEntry<T> = JSON.parse(raw);
            if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
              map.set(keys[i], entry.data);
              this.metrics.hits++;
            } else {
              this.metrics.misses++;
            }
          } catch {
            this.metrics.misses++;
          }
        } else {
          this.metrics.misses++;
        }
      }

      return map;
    } catch (error) {
      this.metrics.errors++;
      logger.error('[RedisCache] Error in mget', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }

  /**
   * Get cache metrics for monitoring.
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache hit rate (0-1).
   */
  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    if (total === 0) return 0;
    return this.metrics.hits / total;
  }

  /**
   * Reset metrics (useful for testing).
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  /**
   * Close Redis connection.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      logger.info('[RedisCache] Disconnected from Redis');
    }
  }

  /**
   * Build full cache key with prefix.
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}:${key}`;
  }

  /**
   * Flush all cache entries (use with caution!).
   */
  async flushAll(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      // Only flush keys with our prefix
      const pattern = `${this.config.keyPrefix}:*`;
      const keys = await this.client!.keys(pattern);

      if (keys.length > 0) {
        await this.client!.del(keys);
        logger.warn('[RedisCache] Flushed all cache entries', { count: keys.length });
      }
    } catch (error) {
      logger.error('[RedisCache] Error flushing cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Singleton instance
let cacheInstance: RedisCache | null = null;

/**
 * Get or create singleton Redis cache instance.
 * IMPORTANT: Must call connect() before use.
 */
export function getCache(): RedisCache {
  if (!cacheInstance) {
    const enabled = process.env.REDIS_CACHE_ENABLED !== 'false';
    if (!enabled) {
      logger.warn('[RedisCache] Cache is disabled via REDIS_CACHE_ENABLED=false');
    }

    cacheInstance = new RedisCache({
      defaultTTLMs: parseInt(process.env.REDIS_CACHE_TTL_MS || '60000', 10),
      keyPrefix: process.env.REDIS_CACHE_PREFIX || 'aegis:cache',
      enableCompression: process.env.REDIS_CACHE_COMPRESSION === 'true',
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      connectionTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
    });
  }

  return cacheInstance;
}

/**
 * Check if Redis caching is enabled.
 */
export function isCacheEnabled(): boolean {
  return process.env.REDIS_CACHE_ENABLED !== 'false';
}
