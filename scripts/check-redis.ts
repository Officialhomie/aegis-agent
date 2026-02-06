/**
 * Verify Redis connectivity (PING + SET/GET).
 * Usage: REDIS_URL=... npx tsx scripts/check-redis.ts
 * Or with Railway: railway run npx tsx scripts/check-redis.ts
 */

import 'dotenv/config';

const REDIS_URL = process.env.REDIS_URL?.trim();

async function main(): Promise<void> {
  if (!REDIS_URL) {
    console.error('[check-redis] REDIS_URL is not set. Set it in .env or Railway variables.');
    process.exit(1);
  }

  // Redact URL for logs (show only scheme and host)
  const safeUrl = REDIS_URL.replace(/:[^:@]+@/, ':****@').split('?')[0];
  console.log('[check-redis] Connecting to', safeUrl, '...');

  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: REDIS_URL });
    await client.connect();

    await client.ping();
    console.log('[check-redis] PING ok');

    const testKey = 'aegis:check-redis:' + Date.now();
    await client.set(testKey, 'ok', { EX: 10 });
    const value = await client.get(testKey);
    await client.del(testKey);

    if (value !== 'ok') {
      throw new Error('SET/GET mismatch');
    }
    console.log('[check-redis] SET/GET ok');

    await client.quit();
    console.log('[check-redis] Redis is working.');
    process.exit(0);
  } catch (err) {
    console.error('[check-redis] Failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
