/**
 * Cache Module Tests
 *
 * Comprehensive tests for cache module initialization and helper functions:
 * - initializeCache: Connection, strategy setup, warmup
 * - getCachedProtocolBudget: Write-through budget caching
 * - updateCachedProtocolBudget: Budget updates with write-through
 * - getCachedProtocolWhitelist: Read-through whitelist caching
 * - getCachedAgentReserves: Cache-aside reserves caching
 * - setCachedAgentReserves: Manual reserves caching
 * - getCachedProtocolBudgets: Batch budget fetching
 * - invalidateProtocolCache: Protocol cache invalidation
 * - getCacheMetrics: Metrics retrieval
 * - shutdownCache: Graceful shutdown
 * - Database fallbacks when cache unavailable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis cache
const mockCacheInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  invalidate: vi.fn(),
  mget: vi.fn(),
  isConnected: vi.fn(),
  getMetrics: vi.fn(),
  getHitRate: vi.fn(),
  flushAll: vi.fn(),
};

vi.mock('@/src/lib/cache/redis-cache', () => ({
  getCache: vi.fn(() => mockCacheInstance),
  isCacheEnabled: vi.fn(() => true),
  RedisCache: vi.fn(),
}));

// Mock Prisma
const mockPrisma = {
  protocolSponsor: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@/src/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

// Mock logger
vi.mock('@/src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache strategies module to avoid circular dependencies
vi.mock('@/src/lib/cache/cache-strategies', async () => {
  const actual = await vi.importActual('@/src/lib/cache/cache-strategies');
  return {
    ...actual,
    handleCacheInvalidation: vi.fn(),
  };
});

import {
  initializeCache,
  getCachedProtocolBudget,
  updateCachedProtocolBudget,
  getCachedProtocolWhitelist,
  getCachedAgentReserves,
  setCachedAgentReserves,
  getCachedProtocolBudgets,
  invalidateProtocolCache,
  getCacheMetrics,
  shutdownCache,
} from '@/src/lib/cache';
import { getCache, isCacheEnabled } from '@/src/lib/cache/redis-cache';
import { handleCacheInvalidation } from '@/src/lib/cache/cache-strategies';

describe('initializeCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);
  });

  it('connects to Redis and initializes strategies', async () => {
    await initializeCache({ skipWarmup: true });

    expect(mockCacheInstance.connect).toHaveBeenCalled();
  });

  it('skips connection when skipConnection is true', async () => {
    await initializeCache({ skipConnection: true, skipWarmup: true });

    expect(mockCacheInstance.connect).not.toHaveBeenCalled();
  });

  it('skips warmup when skipWarmup is true', async () => {
    await initializeCache({ skipWarmup: true });

    // Should not query database for warmup
    expect(mockPrisma.protocolSponsor.findMany).not.toHaveBeenCalled();
  });

  it('performs warmup by default', async () => {
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([
      {
        protocolId: 'proto-1',
        balanceUSD: 100,
        totalSpent: 50,
        whitelistedContracts: ['0x1', '0x2'],
      },
    ]);
    mockCacheInstance.set.mockResolvedValue(true);

    await initializeCache();

    expect(mockPrisma.protocolSponsor.findMany).toHaveBeenCalled();
    expect(mockCacheInstance.set).toHaveBeenCalled();
  });

  it('skips initialization when cache is disabled', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    await initializeCache();

    expect(mockCacheInstance.connect).not.toHaveBeenCalled();
  });

  it('handles connection errors gracefully', async () => {
    mockCacheInstance.connect.mockRejectedValue(new Error('Connection failed'));

    // Should not throw
    await initializeCache({ skipWarmup: true });
  });

  it('handles warmup errors gracefully', async () => {
    mockPrisma.protocolSponsor.findMany.mockRejectedValue(new Error('DB error'));

    // Should not throw
    await initializeCache();
  });
});

describe('getCachedProtocolBudget', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    // Initialize cache to set up strategies
    await initializeCache({ skipWarmup: true });
  });

  it('returns cached budget on cache hit', async () => {
    const cachedBudget = { balanceUSD: 100, totalSpent: 25 };
    mockCacheInstance.get.mockResolvedValue(cachedBudget);

    const result = await getCachedProtocolBudget('test-protocol');

    expect(result).toEqual(cachedBudget);
    expect(mockPrisma.protocolSponsor.findUnique).not.toHaveBeenCalled();
  });

  it('loads from database on cache miss', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue({
      balanceUSD: 200,
      totalSpent: 50,
    });

    const result = await getCachedProtocolBudget('test-protocol');

    expect(result).toEqual({ balanceUSD: 200, totalSpent: 50 });
    expect(mockPrisma.protocolSponsor.findUnique).toHaveBeenCalledWith({
      where: { protocolId: 'test-protocol' },
      select: { balanceUSD: true, totalSpent: true },
    });
  });

  it('returns null when protocol not found', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);

    const result = await getCachedProtocolBudget('non-existent');

    expect(result).toBeNull();
  });

  it('handles database errors gracefully', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await getCachedProtocolBudget('error-protocol');

    expect(result).toBeNull();
  });
});

describe('updateCachedProtocolBudget', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.delete.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);
    mockPrisma.protocolSponsor.update.mockResolvedValue({});
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue({
      balanceUSD: 100,
      totalSpent: 50,
    });

    await initializeCache({ skipWarmup: true });
  });

  it('updates database first (write-through)', async () => {
    await updateCachedProtocolBudget('test-protocol', 75, 25);

    expect(mockPrisma.protocolSponsor.update).toHaveBeenCalledWith({
      where: { protocolId: 'test-protocol' },
      data: {
        balanceUSD: 75,
        totalSpent: { increment: 25 },
      },
    });
  });

  it('updates cache after database update', async () => {
    mockCacheInstance.get.mockResolvedValue({ balanceUSD: 100, totalSpent: 50 });

    await updateCachedProtocolBudget('test-protocol', 75, 25);

    expect(mockCacheInstance.set).toHaveBeenCalled();
  });

  it('triggers cache invalidation event', async () => {
    await updateCachedProtocolBudget('test-protocol', 75, 25);

    expect(handleCacheInvalidation).toHaveBeenCalledWith(
      { type: 'PROTOCOL_BUDGET_UPDATED', protocolId: 'test-protocol' },
      mockCacheInstance
    );
  });

  it('handles database update errors', async () => {
    mockPrisma.protocolSponsor.update.mockRejectedValue(new Error('Update failed'));

    // Should not throw
    await updateCachedProtocolBudget('test-protocol', 75, 25);
  });
});

describe('getCachedProtocolWhitelist', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache({ skipWarmup: true });
  });

  it('returns cached whitelist on hit', async () => {
    const cachedWhitelist = ['0x1111', '0x2222', '0x3333'];
    mockCacheInstance.get.mockResolvedValue(cachedWhitelist);

    const result = await getCachedProtocolWhitelist('test-protocol');

    expect(result).toEqual(cachedWhitelist);
    expect(mockPrisma.protocolSponsor.findUnique).not.toHaveBeenCalled();
  });

  it('loads from database on cache miss', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue({
      whitelistedContracts: ['0x4444', '0x5555'],
    });

    const result = await getCachedProtocolWhitelist('test-protocol');

    expect(result).toEqual(['0x4444', '0x5555']);
  });

  it('returns empty array when protocol not found', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue(null);

    const result = await getCachedProtocolWhitelist('non-existent');

    expect(result).toEqual([]);
  });

  it('returns empty array on database error', async () => {
    mockCacheInstance.get.mockResolvedValue(null);
    mockPrisma.protocolSponsor.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await getCachedProtocolWhitelist('error-protocol');

    expect(result).toEqual([]);
  });
});

describe('getCachedAgentReserves', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache({ skipWarmup: true });
  });

  it('returns cached reserves on hit', async () => {
    const cachedReserves = { ETH: 1.5, USDC: 1000, chainId: 84532 };
    mockCacheInstance.get.mockResolvedValue(cachedReserves);

    const result = await getCachedAgentReserves();

    expect(result).toEqual(cachedReserves);
  });

  it('returns null on cache miss (cache-aside pattern)', async () => {
    mockCacheInstance.get.mockResolvedValue(null);

    const result = await getCachedAgentReserves();

    expect(result).toBeNull();
  });
});

describe('setCachedAgentReserves', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache({ skipWarmup: true });
  });

  it('sets reserves in cache', async () => {
    const reserves = { ETH: 2.5, USDC: 2000, chainId: 84532 };

    await setCachedAgentReserves(reserves);

    expect(mockCacheInstance.set).toHaveBeenCalled();
  });
});

describe('getCachedProtocolBudgets', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.mget.mockResolvedValue(new Map());
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache({ skipWarmup: true });
  });

  it('returns budgets for multiple protocols', async () => {
    const cachedData = new Map([
      ['protocol:p1:budget', { balanceUSD: 100, totalSpent: 25 }],
    ]);
    mockCacheInstance.mget.mockResolvedValue(cachedData);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([
      { protocolId: 'p2', balanceUSD: 200, totalSpent: 50 },
    ]);

    const result = await getCachedProtocolBudgets(['p1', 'p2']);

    expect(result.size).toBe(2);
    expect(result.get('p1')).toEqual({ balanceUSD: 100, totalSpent: 25 });
    expect(result.get('p2')).toEqual({ balanceUSD: 200, totalSpent: 50 });
  });

  it('returns empty map for empty input', async () => {
    const result = await getCachedProtocolBudgets([]);

    expect(result).toEqual(new Map());
  });
});

describe('invalidateProtocolCache', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.invalidate.mockResolvedValue(3);
    mockCacheInstance.getHitRate.mockReturnValue(0);
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache({ skipWarmup: true });
  });

  it('invalidates all protocol cache entries', async () => {
    await invalidateProtocolCache('test-protocol');

    expect(mockCacheInstance.invalidate).toHaveBeenCalledWith('protocol:test-protocol:*');
  });
});

describe('getCacheMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.getMetrics.mockReturnValue({
      hits: 100,
      misses: 20,
      sets: 50,
      deletes: 10,
      errors: 2,
    });
    mockCacheInstance.getHitRate.mockReturnValue(0.833);
    mockCacheInstance.isConnected.mockReturnValue(true);
  });

  it('returns comprehensive metrics', () => {
    const metrics = getCacheMetrics();

    expect(metrics).toEqual({
      hits: 100,
      misses: 20,
      sets: 50,
      deletes: 10,
      errors: 2,
      hitRate: 0.833,
      enabled: true,
      connected: true,
    });
  });
});

describe('shutdownCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheInstance.disconnect.mockResolvedValue(undefined);
  });

  it('disconnects from Redis', async () => {
    await shutdownCache();

    expect(mockCacheInstance.disconnect).toHaveBeenCalled();
  });

  it('handles disconnect errors gracefully', async () => {
    mockCacheInstance.disconnect.mockRejectedValue(new Error('Disconnect failed'));

    // Should not throw
    await shutdownCache();
  });
});

describe('Database Fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate cache not initialized (strategies are null)
    vi.resetModules();
  });

  it('getCachedProtocolBudget falls back to database when strategy not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue({
      balanceUSD: 500,
      totalSpent: 100,
    });

    // Re-import to get uninitialized state
    const { getCachedProtocolBudget } = await import('@/src/lib/cache');

    const result = await getCachedProtocolBudget('fallback-protocol');

    expect(result).toEqual({ balanceUSD: 500, totalSpent: 100 });
  });

  it('getCachedProtocolWhitelist falls back to database when strategy not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    mockPrisma.protocolSponsor.findUnique.mockResolvedValue({
      whitelistedContracts: ['0xfallback'],
    });

    const { getCachedProtocolWhitelist } = await import('@/src/lib/cache');

    const result = await getCachedProtocolWhitelist('fallback-protocol');

    expect(result).toEqual(['0xfallback']);
  });
});

describe('Cache Warmup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    mockCacheInstance.connect.mockResolvedValue(undefined);
    mockCacheInstance.set.mockResolvedValue(true);
    mockCacheInstance.getHitRate.mockReturnValue(0);
  });

  it('loads active protocols with positive balance', async () => {
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([
      {
        protocolId: 'active-1',
        balanceUSD: 100,
        totalSpent: 25,
        whitelistedContracts: ['0x1'],
      },
      {
        protocolId: 'active-2',
        balanceUSD: 200,
        totalSpent: 50,
        whitelistedContracts: ['0x2', '0x3'],
      },
    ]);

    await initializeCache();

    expect(mockPrisma.protocolSponsor.findMany).toHaveBeenCalledWith({
      where: { balanceUSD: { gt: 0 } },
      select: {
        protocolId: true,
        balanceUSD: true,
        totalSpent: true,
        whitelistedContracts: true,
      },
    });
  });

  it('caches both budgets and whitelists', async () => {
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([
      {
        protocolId: 'proto-1',
        balanceUSD: 100,
        totalSpent: 25,
        whitelistedContracts: ['0x1'],
      },
    ]);

    await initializeCache();

    // Should have set calls for both budget and whitelist warmup
    expect(mockCacheInstance.set).toHaveBeenCalled();
  });

  it('skips warmup when no active protocols', async () => {
    mockPrisma.protocolSponsor.findMany.mockResolvedValue([]);

    await initializeCache();

    expect(mockCacheInstance.set).not.toHaveBeenCalled();
  });
});

describe('Graceful Degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateCachedProtocolBudget does nothing when strategy not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { updateCachedProtocolBudget } = await import('@/src/lib/cache');

    // Should not throw
    await updateCachedProtocolBudget('test', 100, 25);

    expect(mockPrisma.protocolSponsor.update).not.toHaveBeenCalled();
  });

  it('getCachedAgentReserves returns null when strategy not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { getCachedAgentReserves } = await import('@/src/lib/cache');

    const result = await getCachedAgentReserves();

    expect(result).toBeNull();
  });

  it('setCachedAgentReserves does nothing when strategy not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { setCachedAgentReserves } = await import('@/src/lib/cache');

    // Should not throw
    await setCachedAgentReserves({ ETH: 1, USDC: 100, chainId: 84532 });

    expect(mockCacheInstance.set).not.toHaveBeenCalled();
  });

  it('invalidateProtocolCache does nothing when batchOps not initialized', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { invalidateProtocolCache } = await import('@/src/lib/cache');

    // Should not throw
    await invalidateProtocolCache('test');

    expect(mockCacheInstance.invalidate).not.toHaveBeenCalled();
  });
});

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('respects REDIS_CACHE_ENABLED=false', async () => {
    process.env.REDIS_CACHE_ENABLED = 'false';
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    vi.resetModules();
    const { initializeCache } = await import('@/src/lib/cache');

    await initializeCache();

    expect(mockCacheInstance.connect).not.toHaveBeenCalled();
  });
});
