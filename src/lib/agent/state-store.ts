/**
 * Optional persistent state store for rate limiter and circuit breaker.
 * When REDIS_URL is set, uses Redis; otherwise in-memory (per process).
 */

export interface StateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { px?: number }): Promise<void>;
  /** Atomic set-if-not-exists. Returns true if key was set, false if key already existed. */
  setNX(key: string, value: string, options?: { px?: number }): Promise<boolean>;
}

const memory = new Map<string, { value: string; expires?: number }>();

export const memoryStore: StateStore = {
  async get(key: string): Promise<string | null> {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expires != null && Date.now() > entry.expires) {
      memory.delete(key);
      return null;
    }
    return entry.value;
  },
  async set(key: string, value: string, options?: { px?: number }): Promise<void> {
    const expires = options?.px != null ? Date.now() + options.px : undefined;
    memory.set(key, { value, expires });
  },
  async setNX(key: string, value: string, options?: { px?: number }): Promise<boolean> {
    const entry = memory.get(key);
    if (entry != null && (entry.expires == null || Date.now() <= entry.expires)) return false;
    if (entry != null) memory.delete(key);
    const expires = options?.px != null ? Date.now() + options.px : undefined;
    memory.set(key, { value, expires });
    return true;
  },
};

/** Minimal Redis client interface to avoid package type conflicts (redis vs @redis/client) */
interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, options: { NX?: boolean; PX?: number }): Promise<string | null>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  connect(): Promise<unknown>;
}

let redisClient: RedisClientLike | null = null;

async function getRedisClient(): Promise<RedisClientLike | null> {
  const url = process.env.REDIS_URL;
  if (!url?.trim()) return null;
  if (redisClient) return redisClient;
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url }) as unknown as RedisClientLike;
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    return null;
  }
}

export async function getRedisStore(): Promise<StateStore | null> {
  const client = await getRedisClient();
  if (!client) return null;
  return {
    async get(key: string): Promise<string | null> {
      return client.get(key);
    },
    async set(key: string, value: string, options?: { px?: number }): Promise<void> {
      if (options?.px != null) await client.setEx(key, options.px / 1000, value);
      else await client.set(key, value);
    },
    async setNX(key: string, value: string, options?: { px?: number }): Promise<boolean> {
      const px = options?.px ?? 30_000;
      const result = await client.set(key, value, { NX: true, PX: px });
      return result === 'OK';
    },
  };
}

let cachedStore: StateStore | null = null;

/**
 * Get the shared state store (Redis if REDIS_URL set, else in-memory).
 */
export async function getStateStore(): Promise<StateStore> {
  if (cachedStore) return cachedStore;
  const redis = await getRedisStore();
  cachedStore = redis ?? memoryStore;
  return cachedStore;
}
