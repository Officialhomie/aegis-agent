# Step 4: Database Setup

This doc covers **verifying** and **completing** database setup for Aegis Agent production. For the full checklist, see [PRODUCTION_DEPLOYMENT.md §4 – Database Setup](../PRODUCTION_DEPLOYMENT.md#4-database-setup).

---

## Is the database already set up?

If you already created a Supabase (or other Postgres) project and set `DATABASE_URL` / `DIRECT_URL` in `.env`, run these **on your machine** (where the DB is reachable):

### 1. Check connectivity and migration state

```bash
cd aegis-agent
npm run db:generate
npx prisma migrate status
```

- **If you see** `Database schema is up to date` or a list of applied migrations → DB is in sync; go to [Seed](#2-seed-initial-data).
- **If you see** `P1001: Can't reach database server` → Prisma CLI uses `DIRECT_URL` (see `prisma.config.ts`). The error means the DB host is unreachable from your machine. Check: (1) Supabase project not [paused](https://supabase.com/docs/guides/platform/database-pausing) (resume in dashboard), (2) `.env` has correct `DIRECT_URL` (direct connection: `db.[project-ref].supabase.co:5432`), (3) firewall/VPN allows outbound port 5432, (4) try from another network (e.g. mobile hotspot) to rule out local blocking.
- **If you see** `No migration found` or schema drift → apply schema (see [Apply schema](#apply-schema-no-migrations-yet) below).

### 2. Optional: list tables (confirm tables exist)

```bash
npx prisma db execute --stdin <<< "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

If this returns your expected tables (`Agent`, `Observation`, `Decision`, etc.), the DB is set up.

### 3. Optional: run the DB connectivity script

From the project root:

```bash
npm run check:db
```

Prints connection status and lists tables in `public`. Requires network access to your DB.

---

## Apply schema (no migrations yet)

This project may use **Prisma Migrate** (migration history) or **`db push`** (sync schema without migrations). Choose one.

### Option A: Use migrations (recommended for production)

```bash
# Create initial migration from current schema
npx prisma migrate dev --name init

# Then for production / CI, apply pending migrations
npx prisma migrate deploy
```

### Option B: Use db push (no migration history)

If you have been using `db push` and don’t need migration files:

```bash
npx prisma db push
```

Then [seed](#2-seed-initial-data) and optionally [verify](#4-verify-optional) with Prisma Studio.

---

## 2. Seed initial data

After the schema is applied, seed protocol sponsors:

```bash
npm run db:seed
```

Expected: `Seeded protocol: test-protocol`, `uniswap-sponsor`, `aave-sponsor`, then `Seed complete.`

---

## 4. Verify (optional)

```bash
npx prisma studio
```

Opens Prisma Studio in the browser so you can confirm tables and seed data.

---

## Summary: “Is my DB all set up?”

| Check | Command | What you want |
|-------|---------|----------------|
| Config | `DATABASE_URL` and `DIRECT_URL` in `.env` | Set (Supabase pooler + direct) |
| Client | `npm run db:generate` | Success |
| Reachable | `npx prisma migrate status` (or `db execute` / `check:db`) | No P1001; schema up to date or migrations applied |
| Schema | Migrations applied or `db push` done | Tables exist |
| Seed | `npm run db:seed` | ProtocolSponsor rows present |

If all of the above pass, the database is set up for production.

---

## Next step

After the database is set up → [Step 5: Infrastructure Deployment](../PRODUCTION_DEPLOYMENT.md#5-infrastructure-deployment) (Railway or Docker).
