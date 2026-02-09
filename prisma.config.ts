import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma's env() throws on empty/unset vars, so use process.env for fallback logic.
const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!datasourceUrl) {
  throw new Error('Neither DIRECT_URL nor DATABASE_URL is set. At least one is required.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // CLI (migrate, studio, db push) prefers direct connection; falls back to session-mode pooler (DATABASE_URL).
    // Direct URL (db.xxx.supabase.co) is IPv6-only — use pooler if your network lacks IPv6.
    url: datasourceUrl,
  },
});
