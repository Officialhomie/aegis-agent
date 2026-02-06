/**
 * Redis connectivity check for monitoring.
 * GET /api/health/redis -> { redis: 'connected' | 'disconnected', message?: string }
 */

import { getRedisStore } from '../../../../src/lib/agent/state-store';

export async function GET(): Promise<Response> {
  const store = await getRedisStore();
  if (!store) {
    return Response.json(
      { redis: 'disconnected', message: 'REDIS_URL not set or connection failed' },
      { status: 503 }
    );
  }
  try {
    const key = 'aegis:health:redis:' + Date.now();
    await store.set(key, '1', { px: 5000 });
    const value = await store.get(key);
    if (value !== '1') {
      return Response.json(
        { redis: 'disconnected', message: 'SET/GET check failed' },
        { status: 503 }
      );
    }
    return Response.json({ redis: 'connected' });
  } catch (err) {
    return Response.json(
      {
        redis: 'disconnected',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
