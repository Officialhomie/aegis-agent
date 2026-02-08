/**
 * Cache Strategies Tests
 *
 * Comprehensive tests for cache strategies covering:
 * - WriteThroughStrategy: Atomic updates with database write-through
 * - ReadThroughStrategy: Lazy loading with 5min TTL
 * - CacheAsideStrategy: Manual cache updates with 30s TTL
 * - BatchCacheOperations: Multi-key fetches in single round-trip
 * - CacheKeys: Key builders for consistent key construction
 * - handleCacheInvalidation: Event-based cache invalidation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock RedisCache
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  invalidate: vi.fn(),
  mget: vi.fn(),
  isConnected: vi.fn(),
  getMetrics: vi.fn(),
};

// Mock logger
vi.mock('@/src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  WriteThroughStrategy,
  ReadThroughStrategy,
  CacheAsideStrategy,
  BatchCacheOperations,
  CacheKeys,
  handleCacheInvalidation,
  type CacheInvalidationEvent,
} from '@/src/lib/cache/cache-strategies';
import type { RedisCache } from '@/src/lib/cache/redis-cache';

describe('WriteThroughStrategy', () => {
  let strategy: WriteThroughStrategy<{ value: number }>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);
    mockCache.invalidate.mockResolvedValue(0);

    strategy = new WriteThroughStrategy(mockCache as unknown as RedisCache, 60000);
  });

  describe('get', () => {
    it('returns cached value on cache hit', async () => {
      const cachedValue = { value: 123 };
      mockCache.get.mockResolvedValue(cachedValue);
      const loader = vi.fn();

      const result = await strategy.get('test-key', loader);

      expect(result).toEqual(cachedValue);
      expect(loader).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalledWith('test-key');
    });

    it('loads from source on cache miss', async () => {
      const sourceValue = { value: 456 };
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(sourceValue);

      const result = await strategy.get('test-key', loader);

      expect(result).toEqual(sourceValue);
      expect(loader).toHaveBeenCalled();
    });

    it('populates cache after loading from source', async () => {
      const sourceValue = { value: 789 };
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(sourceValue);

      await strategy.get('test-key', loader);

      expect(mockCache.set).toHaveBeenCalledWith(
        'test-key',
        sourceValue,
        { ttlMs: 60000 }
      );
    });

    it('does not cache null values from loader', async () => {
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(null);

      const result = await strategy.get('test-key', loader);

      expect(result).toBeNull();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('writes to cache with TTL', async () => {
      const value = { value: 100 };

      const result = await strategy.set('test-key', value);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith('test-key', value, {
        ttlMs: 60000,
      });
    });

    it('respects custom options (options override strategy TTL)', async () => {
      const value = { value: 100 };

      await strategy.set('test-key', value, { ttlMs: 30000, nx: true });

      // Options spread after strategy TTL, so custom ttlMs wins
      expect(mockCache.set).toHaveBeenCalledWith('test-key', value, {
        ttlMs: 30000,
        nx: true,
      });
    });

    it('returns false when cache write fails', async () => {
      mockCache.set.mockResolvedValue(false);
      const value = { value: 100 };

      const result = await strategy.set('test-key', value);

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes key from cache', async () => {
      const result = await strategy.delete('test-key');

      expect(result).toBe(true);
      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
    });

    it('invalidates pattern if provided', async () => {
      await strategy.delete('test-key', { invalidatePattern: 'protocol:*' });

      expect(mockCache.invalidate).toHaveBeenCalledWith('protocol:*');
      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('update', () => {
    it('applies updater to current value and caches result', async () => {
      const currentValue = { value: 100 };
      mockCache.get.mockResolvedValue(currentValue);

      const updater = vi.fn().mockResolvedValue({ value: 200 });

      const result = await strategy.update('test-key', updater);

      expect(updater).toHaveBeenCalledWith(currentValue);
      expect(result).toEqual({ value: 200 });
      expect(mockCache.set).toHaveBeenCalledWith(
        'test-key',
        { value: 200 },
        { ttlMs: 60000 }
      );
    });

    it('passes null to updater when key not cached', async () => {
      mockCache.get.mockResolvedValue(null);
      const updater = vi.fn().mockResolvedValue({ value: 50 });

      await strategy.update('test-key', updater);

      expect(updater).toHaveBeenCalledWith(null);
    });

    it('deletes key when updater returns null', async () => {
      mockCache.get.mockResolvedValue({ value: 100 });
      const updater = vi.fn().mockResolvedValue(null);

      const result = await strategy.update('test-key', updater);

      expect(result).toBeNull();
      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
});

describe('ReadThroughStrategy', () => {
  let strategy: ReadThroughStrategy<string[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);
    mockCache.invalidate.mockResolvedValue(0);

    strategy = new ReadThroughStrategy(mockCache as unknown as RedisCache, 300000);
  });

  describe('get', () => {
    it('returns cached value on hit', async () => {
      const cachedValue = ['addr1', 'addr2'];
      mockCache.get.mockResolvedValue(cachedValue);
      const loader = vi.fn();

      const result = await strategy.get('whitelist-key', loader);

      expect(result).toEqual(cachedValue);
      expect(loader).not.toHaveBeenCalled();
    });

    it('loads and caches on miss', async () => {
      const sourceValue = ['addr3', 'addr4'];
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(sourceValue);

      const result = await strategy.get('whitelist-key', loader);

      expect(result).toEqual(sourceValue);
      expect(mockCache.set).toHaveBeenCalledWith(
        'whitelist-key',
        sourceValue,
        { ttlMs: 300000 }
      );
    });

    it('uses 5 minute TTL by default', async () => {
      const defaultStrategy = new ReadThroughStrategy(mockCache as unknown as RedisCache);
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(['addr1']);

      await defaultStrategy.get('key', loader);

      expect(mockCache.set).toHaveBeenCalledWith(
        'key',
        ['addr1'],
        { ttlMs: 300000 }
      );
    });
  });

  describe('set', () => {
    it('sets value with strategy TTL', async () => {
      await strategy.set('key', ['addr1', 'addr2']);

      expect(mockCache.set).toHaveBeenCalledWith('key', ['addr1', 'addr2'], {
        ttlMs: 300000,
      });
    });
  });

  describe('delete', () => {
    it('deletes key and optionally invalidates pattern', async () => {
      await strategy.delete('key', { invalidatePattern: 'whitelist:*' });

      expect(mockCache.invalidate).toHaveBeenCalledWith('whitelist:*');
      expect(mockCache.delete).toHaveBeenCalledWith('key');
    });
  });

  describe('update', () => {
    it('applies updater and caches result', async () => {
      mockCache.get.mockResolvedValue(['addr1']);
      const updater = vi.fn().mockResolvedValue(['addr1', 'addr2']);

      const result = await strategy.update('key', updater);

      expect(result).toEqual(['addr1', 'addr2']);
      expect(mockCache.set).toHaveBeenCalled();
    });
  });
});

describe('CacheAsideStrategy', () => {
  let strategy: CacheAsideStrategy<{ ETH: number; USDC: number }>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);
    mockCache.invalidate.mockResolvedValue(0);

    strategy = new CacheAsideStrategy(mockCache as unknown as RedisCache, 30000);
  });

  describe('get', () => {
    it('returns cached value on hit without calling loader', async () => {
      const cachedValue = { ETH: 1.5, USDC: 1000 };
      mockCache.get.mockResolvedValue(cachedValue);
      const loader = vi.fn();

      const result = await strategy.get('reserves-key', loader);

      expect(result).toEqual(cachedValue);
      expect(loader).not.toHaveBeenCalled();
    });

    it('calls loader on cache miss but does NOT cache', async () => {
      const sourceValue = { ETH: 2.0, USDC: 2000 };
      mockCache.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue(sourceValue);

      const result = await strategy.get('reserves-key', loader);

      expect(result).toEqual(sourceValue);
      expect(loader).toHaveBeenCalled();
      // Cache-aside does NOT auto-populate on read
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('uses 30 second TTL by default', async () => {
      const defaultStrategy = new CacheAsideStrategy(mockCache as unknown as RedisCache);
      await defaultStrategy.set('key', { ETH: 1, USDC: 100 });

      expect(mockCache.set).toHaveBeenCalledWith(
        'key',
        { ETH: 1, USDC: 100 },
        { ttlMs: 30000 }
      );
    });
  });

  describe('set', () => {
    it('explicitly sets value in cache', async () => {
      const value = { ETH: 3.0, USDC: 3000 };

      const result = await strategy.set('reserves-key', value);

      expect(result).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith('reserves-key', value, {
        ttlMs: 30000,
      });
    });

    it('allows custom TTL override', async () => {
      const value = { ETH: 3.0, USDC: 3000 };

      await strategy.set('reserves-key', value, { ttlMs: 15000 });

      // Options spread after strategy TTL, so custom ttlMs wins
      expect(mockCache.set).toHaveBeenCalledWith('reserves-key', value, {
        ttlMs: 15000,
      });
    });
  });

  describe('delete', () => {
    it('deletes key from cache', async () => {
      const result = await strategy.delete('reserves-key');

      expect(result).toBe(true);
      expect(mockCache.delete).toHaveBeenCalledWith('reserves-key');
    });
  });

  describe('update', () => {
    it('updates cached value atomically', async () => {
      mockCache.get.mockResolvedValue({ ETH: 1.0, USDC: 1000 });
      const updater = vi.fn().mockResolvedValue({ ETH: 1.5, USDC: 1500 });

      const result = await strategy.update('key', updater);

      expect(result).toEqual({ ETH: 1.5, USDC: 1500 });
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('deletes on null update result', async () => {
      mockCache.get.mockResolvedValue({ ETH: 1.0, USDC: 1000 });
      const updater = vi.fn().mockResolvedValue(null);

      await strategy.update('key', updater);

      expect(mockCache.delete).toHaveBeenCalledWith('key');
    });
  });
});

describe('BatchCacheOperations', () => {
  let batchOps: BatchCacheOperations;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.mget.mockResolvedValue(new Map());
    mockCache.set.mockResolvedValue(true);
    mockCache.invalidate.mockResolvedValue(0);

    batchOps = new BatchCacheOperations(mockCache as unknown as RedisCache);
  });

  describe('getProtocolBudgets', () => {
    it('returns empty map for empty protocol IDs', async () => {
      const loader = vi.fn();

      const result = await batchOps.getProtocolBudgets([], loader);

      expect(result).toEqual(new Map());
      expect(mockCache.mget).not.toHaveBeenCalled();
      expect(loader).not.toHaveBeenCalled();
    });

    it('returns cached values without calling loader', async () => {
      const cachedData = new Map([
        ['protocol:p1:budget', { balanceUSD: 100, totalSpent: 50 }],
        ['protocol:p2:budget', { balanceUSD: 200, totalSpent: 75 }],
      ]);
      mockCache.mget.mockResolvedValue(cachedData);
      const loader = vi.fn();

      const result = await batchOps.getProtocolBudgets(['p1', 'p2'], loader);

      expect(result.size).toBe(2);
      expect(result.get('p1')).toEqual({ balanceUSD: 100, totalSpent: 50 });
      expect(result.get('p2')).toEqual({ balanceUSD: 200, totalSpent: 75 });
      expect(loader).not.toHaveBeenCalled();
    });

    it('calls loader for missing values', async () => {
      const cachedData = new Map([
        ['protocol:p1:budget', { balanceUSD: 100, totalSpent: 50 }],
      ]);
      mockCache.mget.mockResolvedValue(cachedData);

      const loadedData = new Map([
        ['p2', { balanceUSD: 200, totalSpent: 75 }],
        ['p3', { balanceUSD: 300, totalSpent: 100 }],
      ]);
      const loader = vi.fn().mockResolvedValue(loadedData);

      const result = await batchOps.getProtocolBudgets(['p1', 'p2', 'p3'], loader);

      expect(result.size).toBe(3);
      expect(result.get('p1')).toEqual({ balanceUSD: 100, totalSpent: 50 });
      expect(result.get('p2')).toEqual({ balanceUSD: 200, totalSpent: 75 });
      expect(result.get('p3')).toEqual({ balanceUSD: 300, totalSpent: 100 });
      expect(loader).toHaveBeenCalledWith(['p2', 'p3']);
    });

    it('caches loaded values for future requests', async () => {
      mockCache.mget.mockResolvedValue(new Map());
      const loadedData = new Map([
        ['p1', { balanceUSD: 100, totalSpent: 50 }],
      ]);
      const loader = vi.fn().mockResolvedValue(loadedData);

      await batchOps.getProtocolBudgets(['p1'], loader);

      // Wait for fire-and-forget cache writes
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockCache.set).toHaveBeenCalledWith(
        'protocol:p1:budget',
        { balanceUSD: 100, totalSpent: 50 },
        { ttlMs: 60000 }
      );
    });

    it('builds correct cache keys', async () => {
      mockCache.mget.mockResolvedValue(new Map());
      const loader = vi.fn().mockResolvedValue(new Map());

      await batchOps.getProtocolBudgets(['proto-1', 'proto-2'], loader);

      expect(mockCache.mget).toHaveBeenCalledWith([
        'protocol:proto-1:budget',
        'protocol:proto-2:budget',
      ]);
    });
  });

  describe('invalidateProtocol', () => {
    it('invalidates all keys for protocol', async () => {
      mockCache.invalidate.mockResolvedValue(3);

      const result = await batchOps.invalidateProtocol('my-protocol');

      expect(result).toBe(3);
      expect(mockCache.invalidate).toHaveBeenCalledWith('protocol:my-protocol:*');
    });
  });

  describe('warmup', () => {
    it('caches all provided data', async () => {
      const data = new Map([
        ['key1', { value: 1 }],
        ['key2', { value: 2 }],
        ['key3', { value: 3 }],
      ]);

      await batchOps.warmup(data, 60000);

      expect(mockCache.set).toHaveBeenCalledTimes(3);
      expect(mockCache.set).toHaveBeenCalledWith('key1', { value: 1 }, { ttlMs: 60000 });
      expect(mockCache.set).toHaveBeenCalledWith('key2', { value: 2 }, { ttlMs: 60000 });
      expect(mockCache.set).toHaveBeenCalledWith('key3', { value: 3 }, { ttlMs: 60000 });
    });

    it('handles empty data gracefully', async () => {
      await batchOps.warmup(new Map(), 60000);

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('continues on individual failures', async () => {
      mockCache.set
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      const data = new Map([
        ['key1', { value: 1 }],
        ['key2', { value: 2 }],
        ['key3', { value: 3 }],
      ]);

      // Should not throw
      await batchOps.warmup(data, 60000);

      expect(mockCache.set).toHaveBeenCalledTimes(3);
    });
  });
});

describe('CacheKeys', () => {
  describe('protocolBudget', () => {
    it('builds correct key', () => {
      expect(CacheKeys.protocolBudget('uniswap')).toBe('protocol:uniswap:budget');
      expect(CacheKeys.protocolBudget('aave-v3')).toBe('protocol:aave-v3:budget');
    });
  });

  describe('protocolWhitelist', () => {
    it('builds correct key', () => {
      expect(CacheKeys.protocolWhitelist('compound')).toBe('protocol:compound:whitelist');
    });
  });

  describe('protocolSponsors', () => {
    it('builds correct key', () => {
      expect(CacheKeys.protocolSponsors('sushi')).toBe('protocol:sushi:sponsors');
    });
  });

  describe('agentReserves', () => {
    it('builds correct key', () => {
      expect(CacheKeys.agentReserves()).toBe('agent:reserves');
    });
  });

  describe('gasPrice', () => {
    it('builds correct key', () => {
      expect(CacheKeys.gasPrice()).toBe('gas:price');
    });
  });

  describe('gasPriceHistory', () => {
    it('builds correct key', () => {
      expect(CacheKeys.gasPriceHistory()).toBe('gas:price:history');
    });
  });

  describe('userTxCount', () => {
    it('builds correct key', () => {
      expect(CacheKeys.userTxCount('0x1234')).toBe('user:0x1234:txcount');
    });
  });

  describe('userLegitimacy', () => {
    it('builds correct key', () => {
      expect(CacheKeys.userLegitimacy('0xabcd')).toBe('user:0xabcd:legitimacy');
    });
  });
});

describe('handleCacheInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.delete.mockResolvedValue(true);
  });

  describe('PROTOCOL_BUDGET_UPDATED', () => {
    it('invalidates protocol budget cache', async () => {
      const event: CacheInvalidationEvent = {
        type: 'PROTOCOL_BUDGET_UPDATED',
        protocolId: 'my-protocol',
      };

      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

      expect(mockCache.delete).toHaveBeenCalledWith('protocol:my-protocol:budget');
    });
  });

  describe('PROTOCOL_WHITELIST_UPDATED', () => {
    it('invalidates protocol whitelist cache', async () => {
      const event: CacheInvalidationEvent = {
        type: 'PROTOCOL_WHITELIST_UPDATED',
        protocolId: 'another-protocol',
      };

      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

      expect(mockCache.delete).toHaveBeenCalledWith('protocol:another-protocol:whitelist');
    });
  });

  describe('SPONSORSHIP_EXECUTED', () => {
    it('invalidates protocol budget and user tx count', async () => {
      const event: CacheInvalidationEvent = {
        type: 'SPONSORSHIP_EXECUTED',
        protocolId: 'sponsor-protocol',
        userAddress: '0x1234abcd',
      };

      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

      expect(mockCache.delete).toHaveBeenCalledWith('protocol:sponsor-protocol:budget');
      expect(mockCache.delete).toHaveBeenCalledWith('user:0x1234abcd:txcount');
    });
  });

  describe('RESERVES_UPDATED', () => {
    it('invalidates agent reserves cache', async () => {
      const event: CacheInvalidationEvent = {
        type: 'RESERVES_UPDATED',
      };

      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

      expect(mockCache.delete).toHaveBeenCalledWith('agent:reserves');
    });
  });

  describe('GAS_PRICE_UPDATED', () => {
    it('invalidates gas price cache', async () => {
      const event: CacheInvalidationEvent = {
        type: 'GAS_PRICE_UPDATED',
      };

      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

      expect(mockCache.delete).toHaveBeenCalledWith('gas:price');
    });
  });

  describe('error handling', () => {
    it('handles delete errors gracefully', async () => {
      mockCache.delete.mockRejectedValue(new Error('Delete failed'));

      const event: CacheInvalidationEvent = {
        type: 'RESERVES_UPDATED',
      };

      // Should not throw
      await handleCacheInvalidation(event, mockCache as unknown as RedisCache);
    });
  });
});

describe('Strategy TTL Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.set.mockResolvedValue(true);
    mockCache.get.mockResolvedValue(null);
  });

  it('WriteThroughStrategy uses 60s default TTL', async () => {
    const strategy = new WriteThroughStrategy(mockCache as unknown as RedisCache);
    const loader = vi.fn().mockResolvedValue({ value: 1 });

    await strategy.get('key', loader);

    expect(mockCache.set).toHaveBeenCalledWith('key', { value: 1 }, { ttlMs: 60000 });
  });

  it('ReadThroughStrategy uses 5min default TTL', async () => {
    const strategy = new ReadThroughStrategy(mockCache as unknown as RedisCache);
    const loader = vi.fn().mockResolvedValue(['item']);

    await strategy.get('key', loader);

    expect(mockCache.set).toHaveBeenCalledWith('key', ['item'], { ttlMs: 300000 });
  });

  it('CacheAsideStrategy uses 30s default TTL', async () => {
    const strategy = new CacheAsideStrategy(mockCache as unknown as RedisCache);

    await strategy.set('key', { value: 1 });

    expect(mockCache.set).toHaveBeenCalledWith('key', { value: 1 }, { ttlMs: 30000 });
  });

  it('allows custom TTL override', async () => {
    const strategy = new WriteThroughStrategy(mockCache as unknown as RedisCache, 120000);
    const loader = vi.fn().mockResolvedValue({ value: 1 });

    await strategy.get('key', loader);

    expect(mockCache.set).toHaveBeenCalledWith('key', { value: 1 }, { ttlMs: 120000 });
  });
});

describe('Strategy Concurrent Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
  });

  it('handles concurrent get operations', async () => {
    const strategy = new WriteThroughStrategy(mockCache as unknown as RedisCache);
    const loader = vi.fn().mockResolvedValue({ value: 1 });

    const results = await Promise.all([
      strategy.get('key1', loader),
      strategy.get('key2', loader),
      strategy.get('key3', loader),
    ]);

    expect(results).toHaveLength(3);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('handles concurrent set operations', async () => {
    const strategy = new CacheAsideStrategy(mockCache as unknown as RedisCache);

    const results = await Promise.all([
      strategy.set('key1', { value: 1 }),
      strategy.set('key2', { value: 2 }),
      strategy.set('key3', { value: 3 }),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(mockCache.set).toHaveBeenCalledTimes(3);
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);
  });

  it('handles empty arrays', async () => {
    const strategy = new ReadThroughStrategy<string[]>(mockCache as unknown as RedisCache);
    const loader = vi.fn().mockResolvedValue([]);

    const result = await strategy.get('key', loader);

    expect(result).toEqual([]);
    // Empty array is still a valid value to cache
    expect(mockCache.set).toHaveBeenCalledWith('key', [], { ttlMs: 300000 });
  });

  it('handles zero values', async () => {
    const strategy = new WriteThroughStrategy<{ balance: number }>(
      mockCache as unknown as RedisCache
    );
    const loader = vi.fn().mockResolvedValue({ balance: 0 });

    const result = await strategy.get('key', loader);

    expect(result).toEqual({ balance: 0 });
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('handles special characters in keys', async () => {
    const event: CacheInvalidationEvent = {
      type: 'PROTOCOL_BUDGET_UPDATED',
      protocolId: 'protocol:with:colons',
    };

    await handleCacheInvalidation(event, mockCache as unknown as RedisCache);

    expect(mockCache.delete).toHaveBeenCalledWith('protocol:protocol:with:colons:budget');
  });

  it('handles loader throwing error', async () => {
    const strategy = new ReadThroughStrategy(mockCache as unknown as RedisCache);
    const loader = vi.fn().mockRejectedValue(new Error('Loader failed'));

    await expect(strategy.get('key', loader)).rejects.toThrow('Loader failed');
    expect(mockCache.set).not.toHaveBeenCalled();
  });
});
