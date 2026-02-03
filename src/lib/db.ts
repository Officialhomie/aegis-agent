/**
 * Shared Prisma client for Next.js and serverless.
 * Prisma 7 requires an adapter or accelerateUrl; we use @prisma/adapter-pg with DATABASE_URL.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/aegis';
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
  return client;
}
