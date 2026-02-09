/**
 * Quick DB connectivity check. Run: npm run check:db
 * Requires DATABASE_URL in .env and network access to the DB.
 * Uses same adapter as app (Prisma 7 schema has no url in datasource).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '';
if (!connectionString) {
  console.error('DB check failed: DATABASE_URL or DIRECT_URL required');
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    await prisma.$connect();
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    console.log('DB connected. Tables:', tables.length);
    tables.forEach((t) => console.log('  -', t.tablename));
  } catch (e) {
    console.error('DB check failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
