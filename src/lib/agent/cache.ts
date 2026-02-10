/**
 * Re-export cache from lib/cache so agent imports resolve reliably in Turbopack/Next build.
 * Use: import { getCache, ... } from '../cache' or from './cache' (from agent/index).
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
} from '../cache';
