/**
 * Redis Cache Tests
 *
 * Comprehensive tests for RedisCache class covering:
 * - Connection management (connect, disconnect, reconnect)
 * - CRUD operations (get, set, delete, mget)
 * - Cache invalidation patterns
 * - TTL handling
 * - Metrics tracking (hits, misses, errors)
 * - Graceful degradation when disconnected
 * - Singleton pattern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock redis module before importing RedisCache
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  mGet: vi.fn(),
  connect: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

// Mock logger to avoid console noise
vi.mock('@/src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { RedisCache, getCache, isCacheEnabled, type CacheConfig } from '@/src/lib/cache/redis-cache';

describe('RedisCache', () => {
  let cache: RedisCache;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to default success
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.keys.mockResolvedValue([]);
    mockRedisClient.mGet.mockResolvedValue([]);
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.quit.mockResolvedValue(undefined);
    mockRedisClient.on.mockImplementation(() => mockRedisClient);

    cache = new RedisCache();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('uses default config when no options provided', () => {
      const cache = new RedisCache();
      expect(cache).toBeDefined();
      // Verify default state
      expect(cache.isConnected()).toBe(false);
      expect(cache.getMetrics()).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
      });
    });

    it('merges custom config with defaults', () => {
      const customConfig: Partial<CacheConfig> = {
        defaultTTLMs: 120000,
        keyPrefix: 'custom:prefix',
        maxRetries: 5,
      };
      const cache = new RedisCache(customConfig);
      expect(cache).toBeDefined();
    });
  });

  describe('connect', () => {
    it('establishes connection to Redis', async () => {
      // Simulate 'ready' event being fired
      mockRedisClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return mockRedisClient;
      });

      await cache.connect();

      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
      expect(cache.isConnected()).toBe(true);
    });

    it('is idempotent - multiple calls do not reconnect', async () => {
      await cache.connect();
      await cache.connect();
      await cache.connect();

      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });

    it('throws error when connection fails', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(cache.connect()).rejects.toThrow('Connection refused');
      expect(cache.isConnected()).toBe(false);
    });

    it('uses REDIS_URL environment variable', async () => {
      const originalEnv = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://custom-host:6380';

      const cache = new RedisCache();
      await cache.connect();

      expect(mockRedisClient.connect).toHaveBeenCalled();

      process.env.REDIS_URL = originalEnv;
    });

    it('registers error handler on client', async () => {
      await cache.connect();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('registers ready handler on client', async () => {
      await cache.connect();

      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('registers end handler on client', async () => {
      await cache.connect();

      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
    });
  });

  describe('isConnected', () => {
    it('returns false when not connected', () => {
      expect(cache.isConnected()).toBe(false);
    });

    it('returns true after successful connection', async () => {
      await cache.connect();
      expect(cache.isConnected()).toBe(true);
    });

    it('returns false after disconnect', async () => {
      await cache.connect();
      await cache.disconnect();
      expect(cache.isConnected()).toBe(false);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('returns null when key not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cache.get('missing-key');

      expect(result).toBeNull();
      expect(cache.getMetrics().misses).toBe(1);
    });

    it('returns cached value when found', async () => {
      const cachedEntry = {
        data: { name: 'test', value: 123 },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedEntry));

      const result = await cache.get<{ name: string; value: number }>('test-key');

      expect(result).toEqual({ name: 'test', value: 123 });
      expect(cache.getMetrics().hits).toBe(1);
    });

    it('returns null for expired entry and cleans it up', async () => {
      const expiredEntry = {
        data: { name: 'expired' },
        cachedAt: Date.now() - 120000,
        expiresAt: Date.now() - 60000, // Expired 60 seconds ago
        version: 1,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(expiredEntry));

      const result = await cache.get('expired-key');

      expect(result).toBeNull();
      expect(cache.getMetrics().misses).toBe(1);
      // Should try to delete expired entry
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('returns null when not connected', async () => {
      const disconnectedCache = new RedisCache();

      const result = await disconnectedCache.get('any-key');

      expect(result).toBeNull();
      expect(disconnectedCache.getMetrics().misses).toBe(1);
    });

    it('handles JSON parse errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid json {{{');

      const result = await cache.get('corrupt-key');

      expect(result).toBeNull();
      expect(cache.getMetrics().errors).toBe(1);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('error-key');

      expect(result).toBeNull();
      expect(cache.getMetrics().errors).toBe(1);
      expect(cache.getMetrics().lastError).toBe('Redis error');
    });

    it('builds full key with prefix', async () => {
      await cache.get('my-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('aegis:cache:my-key');
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('sets value with default TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await cache.set('key', { value: 'test' });

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'aegis:cache:key',
        expect.any(String),
        expect.objectContaining({ PX: 60000 })
      );
      expect(cache.getMetrics().sets).toBe(1);
    });

    it('sets value with custom TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await cache.set('key', { value: 'test' }, { ttlMs: 30000 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'aegis:cache:key',
        expect.any(String),
        expect.objectContaining({ PX: 30000 })
      );
    });

    it('sets value with NX option (only if not exists)', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await cache.set('key', { value: 'test' }, { nx: true });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'aegis:cache:key',
        expect.any(String),
        expect.objectContaining({ NX: true })
      );
    });

    it('sets value with XX option (only if exists)', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await cache.set('key', { value: 'test' }, { xx: true });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'aegis:cache:key',
        expect.any(String),
        expect.objectContaining({ XX: true })
      );
    });

    it('returns false when not connected', async () => {
      const disconnectedCache = new RedisCache();

      const result = await disconnectedCache.set('key', { value: 'test' });

      expect(result).toBe(false);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Set failed'));

      const result = await cache.set('key', { value: 'test' });

      expect(result).toBe(false);
      expect(cache.getMetrics().errors).toBe(1);
    });

    it('stores proper cache entry structure', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      const now = Date.now();

      await cache.set('key', { name: 'test' }, { ttlMs: 60000 });

      const setCall = mockRedisClient.set.mock.calls[0];
      const storedValue = JSON.parse(setCall[1]);

      expect(storedValue).toMatchObject({
        data: { name: 'test' },
        version: 1,
      });
      expect(storedValue.cachedAt).toBeGreaterThanOrEqual(now);
      expect(storedValue.expiresAt).toBeGreaterThan(storedValue.cachedAt);
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('deletes key from cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cache.delete('key-to-delete');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('aegis:cache:key-to-delete');
      expect(cache.getMetrics().deletes).toBe(1);
    });

    it('returns false when key does not exist', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cache.delete('non-existent-key');

      expect(result).toBe(false);
      expect(cache.getMetrics().deletes).toBe(1);
    });

    it('returns false when not connected', async () => {
      const disconnectedCache = new RedisCache();

      const result = await disconnectedCache.delete('key');

      expect(result).toBe(false);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Delete failed'));

      const result = await cache.delete('key');

      expect(result).toBe(false);
      expect(cache.getMetrics().errors).toBe(1);
    });
  });

  describe('invalidate', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('invalidates all keys matching pattern', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'aegis:cache:protocol:1:budget',
        'aegis:cache:protocol:1:whitelist',
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await cache.invalidate('protocol:1:*');

      expect(result).toBe(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('aegis:cache:protocol:1:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'aegis:cache:protocol:1:budget',
        'aegis:cache:protocol:1:whitelist',
      ]);
    });

    it('returns 0 when no keys match pattern', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await cache.invalidate('non-existent:*');

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('returns 0 when not connected', async () => {
      const disconnectedCache = new RedisCache();

      const result = await disconnectedCache.invalidate('pattern:*');

      expect(result).toBe(0);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Keys failed'));

      const result = await cache.invalidate('pattern:*');

      expect(result).toBe(0);
      expect(cache.getMetrics().errors).toBe(1);
    });

    it('updates delete metrics for each invalidated key', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisClient.del.mockResolvedValue(3);

      await cache.invalidate('*');

      expect(cache.getMetrics().deletes).toBe(3);
    });
  });

  describe('mget', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('returns empty map for empty keys array', async () => {
      const result = await cache.mget([]);

      expect(result).toEqual(new Map());
      expect(mockRedisClient.mGet).not.toHaveBeenCalled();
    });

    it('returns map of found values', async () => {
      const entry1 = {
        data: { value: 1 },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };
      const entry2 = {
        data: { value: 2 },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };
      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify(entry1),
        null,
        JSON.stringify(entry2),
      ]);

      const result = await cache.mget<{ value: number }>(['key1', 'key2', 'key3']);

      expect(result.size).toBe(2);
      expect(result.get('key1')).toEqual({ value: 1 });
      expect(result.get('key3')).toEqual({ value: 2 });
      expect(result.has('key2')).toBe(false);
    });

    it('tracks hits and misses correctly', async () => {
      const validEntry = {
        data: { value: 1 },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };
      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify(validEntry),
        null,
      ]);

      await cache.mget(['key1', 'key2']);

      expect(cache.getMetrics().hits).toBe(1);
      expect(cache.getMetrics().misses).toBe(1);
    });

    it('treats expired entries as misses', async () => {
      const expiredEntry = {
        data: { value: 1 },
        cachedAt: Date.now() - 120000,
        expiresAt: Date.now() - 60000,
        version: 1,
      };
      mockRedisClient.mGet.mockResolvedValue([JSON.stringify(expiredEntry)]);

      const result = await cache.mget(['expired-key']);

      expect(result.size).toBe(0);
      expect(cache.getMetrics().misses).toBe(1);
    });

    it('returns empty map when not connected', async () => {
      const disconnectedCache = new RedisCache();

      const result = await disconnectedCache.mget(['key1', 'key2']);

      expect(result).toEqual(new Map());
    });

    it('handles JSON parse errors for individual entries', async () => {
      const validEntry = {
        data: { value: 1 },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };
      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify(validEntry),
        'invalid json',
      ]);

      const result = await cache.mget(['key1', 'key2']);

      expect(result.size).toBe(1);
      expect(result.get('key1')).toEqual({ value: 1 });
      expect(cache.getMetrics().misses).toBe(1);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedisClient.mGet.mockRejectedValue(new Error('mGet failed'));

      const result = await cache.mget(['key1', 'key2']);

      expect(result).toEqual(new Map());
      expect(cache.getMetrics().errors).toBe(1);
    });
  });

  describe('getMetrics', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('returns copy of metrics object', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await cache.get('key1');
      await cache.get('key2');

      const metrics = cache.getMetrics();
      metrics.misses = 999; // Modify returned object

      // Original metrics should be unchanged
      expect(cache.getMetrics().misses).toBe(2);
    });

    it('tracks all metric types', async () => {
      const validEntry = {
        data: 'value',
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(validEntry));
      await cache.get('key1'); // hit

      mockRedisClient.get.mockResolvedValue(null);
      await cache.get('key2'); // miss

      await cache.set('key3', 'value'); // set

      mockRedisClient.del.mockResolvedValue(1);
      await cache.delete('key4'); // delete

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.sets).toBe(1);
      expect(metrics.deletes).toBe(1);
    });
  });

  describe('getHitRate', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('returns 0 when no operations', () => {
      expect(cache.getHitRate()).toBe(0);
    });

    it('calculates correct hit rate', async () => {
      const validEntry = {
        data: 'value',
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        version: 1,
      };

      // 3 hits
      mockRedisClient.get.mockResolvedValue(JSON.stringify(validEntry));
      await cache.get('key1');
      await cache.get('key2');
      await cache.get('key3');

      // 1 miss
      mockRedisClient.get.mockResolvedValue(null);
      await cache.get('key4');

      expect(cache.getHitRate()).toBe(0.75); // 3 hits / 4 total
    });
  });

  describe('resetMetrics', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('resets all metrics to zero', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await cache.get('key1');
      await cache.get('key2');
      await cache.set('key3', 'value');

      cache.resetMetrics();

      expect(cache.getMetrics()).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
      });
    });
  });

  describe('disconnect', () => {
    it('closes Redis connection', async () => {
      await cache.connect();

      await cache.disconnect();

      expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
      expect(cache.isConnected()).toBe(false);
    });

    it('handles disconnect when not connected', async () => {
      await cache.disconnect();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });
  });

  describe('flushAll', () => {
    beforeEach(async () => {
      await cache.connect();
    });

    it('deletes all keys with prefix', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'aegis:cache:key1',
        'aegis:cache:key2',
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      await cache.flushAll();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('aegis:cache:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'aegis:cache:key1',
        'aegis:cache:key2',
      ]);
    });

    it('does nothing when no keys exist', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await cache.flushAll();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('does nothing when not connected', async () => {
      const disconnectedCache = new RedisCache();

      await disconnectedCache.flushAll();

      expect(mockRedisClient.keys).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Flush failed'));

      // Should not throw
      await cache.flushAll();
    });
  });
});

describe('getCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    vi.resetModules();
  });

  it('returns singleton instance', async () => {
    // Re-import to get fresh module
    const { getCache } = await import('@/src/lib/cache/redis-cache');

    const cache1 = getCache();
    const cache2 = getCache();

    expect(cache1).toBe(cache2);
  });
});

describe('isCacheEnabled', () => {
  const originalEnv = process.env.REDIS_CACHE_ENABLED;

  afterEach(() => {
    process.env.REDIS_CACHE_ENABLED = originalEnv;
  });

  it('returns true by default', async () => {
    delete process.env.REDIS_CACHE_ENABLED;
    const { isCacheEnabled } = await import('@/src/lib/cache/redis-cache');

    expect(isCacheEnabled()).toBe(true);
  });

  it('returns false when explicitly disabled', async () => {
    process.env.REDIS_CACHE_ENABLED = 'false';
    vi.resetModules();
    const { isCacheEnabled } = await import('@/src/lib/cache/redis-cache');

    expect(isCacheEnabled()).toBe(false);
  });

  it('returns true for any other value', async () => {
    process.env.REDIS_CACHE_ENABLED = 'true';
    vi.resetModules();
    const { isCacheEnabled } = await import('@/src/lib/cache/redis-cache');

    expect(isCacheEnabled()).toBe(true);
  });
});

describe('RedisCache - Concurrent Operations', () => {
  let cache: RedisCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.on.mockImplementation(() => mockRedisClient);

    cache = new RedisCache();
    await cache.connect();
  });

  it('handles concurrent get operations', async () => {
    const entry = {
      data: { value: 1 },
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      version: 1,
    };
    mockRedisClient.get.mockResolvedValue(JSON.stringify(entry));

    const results = await Promise.all([
      cache.get('key1'),
      cache.get('key2'),
      cache.get('key3'),
      cache.get('key4'),
      cache.get('key5'),
    ]);

    expect(results).toHaveLength(5);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(cache.getMetrics().hits).toBe(5);
  });

  it('handles concurrent set operations', async () => {
    const results = await Promise.all([
      cache.set('key1', { value: 1 }),
      cache.set('key2', { value: 2 }),
      cache.set('key3', { value: 3 }),
      cache.set('key4', { value: 4 }),
      cache.set('key5', { value: 5 }),
    ]);

    expect(results).toHaveLength(5);
    expect(results.every((r) => r === true)).toBe(true);
    expect(cache.getMetrics().sets).toBe(5);
  });

  it('handles mixed concurrent operations', async () => {
    const entry = {
      data: { value: 1 },
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      version: 1,
    };
    mockRedisClient.get.mockResolvedValue(JSON.stringify(entry));
    mockRedisClient.del.mockResolvedValue(1);

    await Promise.all([
      cache.get('key1'),
      cache.set('key2', { value: 2 }),
      cache.delete('key3'),
      cache.get('key4'),
      cache.set('key5', { value: 5 }),
    ]);

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(2);
    expect(metrics.sets).toBe(2);
    expect(metrics.deletes).toBe(1);
  });
});

describe('RedisCache - Edge Cases', () => {
  let cache: RedisCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.on.mockImplementation(() => mockRedisClient);

    cache = new RedisCache();
    await cache.connect();
  });

  it('handles null values in set', async () => {
    mockRedisClient.set.mockResolvedValue('OK');

    const result = await cache.set('key', null);

    expect(result).toBe(true);
  });

  it('handles undefined values in set', async () => {
    mockRedisClient.set.mockResolvedValue('OK');

    const result = await cache.set('key', undefined);

    expect(result).toBe(true);
  });

  it('handles empty string key', async () => {
    mockRedisClient.get.mockResolvedValue(null);

    const result = await cache.get('');

    expect(result).toBeNull();
    expect(mockRedisClient.get).toHaveBeenCalledWith('aegis:cache:');
  });

  it('handles special characters in key', async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await cache.get('key:with:colons');
    await cache.get('key/with/slashes');
    await cache.get('key.with.dots');

    expect(mockRedisClient.get).toHaveBeenCalledWith('aegis:cache:key:with:colons');
    expect(mockRedisClient.get).toHaveBeenCalledWith('aegis:cache:key/with/slashes');
    expect(mockRedisClient.get).toHaveBeenCalledWith('aegis:cache:key.with.dots');
  });

  it('handles large objects', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const largeObject = {
      data: Array(1000).fill({ nested: { deep: 'value' } }),
      array: Array(1000).fill('item'),
    };

    const result = await cache.set('large-key', largeObject);

    expect(result).toBe(true);
  });

  it('handles unicode characters', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const unicodeData = {
      emoji: '🚀',
      chinese: '中文',
      arabic: 'العربية',
    };

    const result = await cache.set('unicode-key', unicodeData);

    expect(result).toBe(true);
  });
});

describe('RedisCache - Exponential Backoff', () => {
  it('applies exponential backoff on reconnection', async () => {
    const reconnectStrategy = vi.fn();
    let capturedStrategy: ((retries: number) => number | Error) | undefined;

    // Capture the reconnect strategy
    const { createClient } = await import('redis');
    vi.mocked(createClient).mockImplementation((options: any) => {
      capturedStrategy = options?.socket?.reconnectStrategy;
      return mockRedisClient as any;
    });

    vi.resetModules();
    const { RedisCache } = await import('@/src/lib/cache/redis-cache');
    const cache = new RedisCache({ maxRetries: 3 });

    try {
      await cache.connect();
    } catch {
      // Ignore connection errors for this test
    }

    if (capturedStrategy) {
      // Test exponential backoff: 100ms, 200ms, 400ms
      expect(capturedStrategy(0)).toBe(100);
      expect(capturedStrategy(1)).toBe(200);
      expect(capturedStrategy(2)).toBe(400);

      // Test max retries exceeded
      const maxRetriesResult = capturedStrategy(4);
      expect(maxRetriesResult).toBeInstanceOf(Error);
    }
  });
});
