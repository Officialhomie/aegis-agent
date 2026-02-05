/**
 * Shared Prisma client (single pool, cached on globalThis).
 * Prisma 7 uses @prisma/adapter-pg with DATABASE_URL. Pool settings reduce P1008/SocketTimeout.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export function getPrisma(): PrismaClient {
  // #region agent log
  const cached = !!globalForPrisma.prisma;
  fetch('http://127.0.0.1:7248/ingest/d6915d2c-7cdc-4e4d-9879-2c5523431d83',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.ts:getPrisma',message:cached?'returning cached client':'creating new client',data:{cached,hasDatabaseUrl:!!process.env.DATABASE_URL,urlHost:process.env.DATABASE_URL?.replace(/^[^@]+@/,'').split('/')[0]||'none'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:cached?'H4':'H1'})}).catch(()=>{});
  // #endregion
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/aegis';

  const poolConfig = {
    connectionString,
    max: Math.min(parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10) || 5, 20),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? '20000', 10) || 20000,
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS ?? '45000', 10) || 45000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };

  const adapter = new PrismaPg(poolConfig);
  const client = new PrismaClient({ adapter });
  globalForPrisma.prisma = client;
  return client;
}
