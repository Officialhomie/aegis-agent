/**
 * Re-export cache from lib/cache so agent imports resolve reliably in Turbopack/Next build.
 * IMPORTANT: Use explicit '/index' suffix because the repo root has a `cache/` directory
 * (Foundry artifact) that can shadow Turbopack module resolution of bare `../cache`.
 */
export {
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
  getCache,
  RedisCache,
  isCacheEnabled,
  CacheKeys,
  handleCacheInvalidation,
  type CacheInvalidationEvent,
} from '../cache/index';
