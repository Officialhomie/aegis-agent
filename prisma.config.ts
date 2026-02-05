import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use DATABASE_URL so db push and app work with pooler. For migrate dev use DIRECT_URL (Supabase direct) if reachable.
    url: env('DATABASE_URL'),
  },
});
