/**
 * Shared Prisma client (single pool, cached on globalThis).
 * Prisma 7 uses @prisma/adapter-pg with DATABASE_URL. Pool settings reduce P1008/SocketTimeout.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export function getPrisma(): PrismaClient {
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
