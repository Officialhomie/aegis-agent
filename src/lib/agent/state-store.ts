/**
 * Optional persistent state store for rate limiter and circuit breaker.
 * When REDIS_URL is set, uses Redis; otherwise in-memory (per process).
 */

export interface StateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { px?: number }): Promise<void>;
  /** Atomic set-if-not-exists. Returns true if key was set, false if key already existed. */
  setNX(key: string, value: string, options?: { px?: number }): Promise<boolean>;
  /**
   * Execute a Lua script atomically.
   * For Redis: executes via EVAL command.
   * For in-memory: detects script type (check vs record) and runs equivalent JS sorted-set logic.
   * Returns 1 (allowed) or 0 (denied) for check scripts; count (number) for record scripts.
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const memory = new Map<string, { value: string; expires?: number }>();

// In-memory sorted set storage: key -> array of { score (timestamp ms), member (unique id) }
const memorySortedSets = new Map<string, { score: number; member: string }[]>();

function zRemRangeByScore(key: string, minScore: number): void {
  const set = memorySortedSets.get(key);
  if (!set) return;
  const filtered = set.filter((e) => e.score >= minScore);
  memorySortedSets.set(key, filtered);
}

function zCard(key: string): number {
  return memorySortedSets.get(key)?.length ?? 0;
}

function zAdd(key: string, score: number, member: string): void {
  const set = memorySortedSets.get(key) ?? [];
  // Remove existing entry with same member to avoid duplicates
  const filtered = set.filter((e) => e.member !== member);
  filtered.push({ score, member });
  filtered.sort((a, b) => a.score - b.score);
  memorySortedSets.set(key, filtered);
}

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
  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    const key = keys[0];
    if (!key) return 0;

    // Detect script type by checking for ZADD (present in record script, absent in check script)
    const isRecord = script.includes('ZADD');

    if (isRecord) {
      // Record script: ARGV[1]=windowMs, ARGV[2]=now_ms, ARGV[3]=unique_id
      const windowMs = parseInt(args[0], 10);
      const now = parseInt(args[1], 10);
      const member = args[2];
      zRemRangeByScore(key, now - windowMs);
      zAdd(key, now, member);
      return zCard(key);
    } else {
      // Check script: ARGV[1]=limit, ARGV[2]=windowMs, ARGV[3]=now_ms
      const limit = parseInt(args[0], 10);
      const windowMs = parseInt(args[1], 10);
      const now = parseInt(args[2], 10);
      zRemRangeByScore(key, now - windowMs);
      const current = zCard(key);
      return current >= limit ? 0 : 1;
    }
  },
};

/** Minimal Redis client interface to avoid package type conflicts (redis vs @redis/client) */
interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, options: { NX?: boolean; PX?: number }): Promise<string | null>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
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
    async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
      return client.eval(script, { keys, arguments: args });
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
