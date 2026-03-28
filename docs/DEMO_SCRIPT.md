# Aeg-control — 3-minute demo checklist

**Prerequisites**

1. `DATABASE_URL` set; run migrations: `npx prisma migrate deploy` (or `db:migrate` in dev).
2. Seed DB: `npm run db:seed` (protocols + `SponsoredMethod` catalog).
3. `AEGIS_API_KEY` in `.env`; Redis optional but recommended for OpenClaw sessions.
4. `npm run dev` — open `http://localhost:3000/control`.

**Flow**

1. **Overview** — Explain infra vs product using the two cards on `/control`.
2. **Credentials** — Paste API key + session id (e.g. `control-demo-session`); save.
3. **Onboarding** — Walk steps 1–5; use **Bind OpenClaw session** with protocol `test-protocol` (or your protocol id).
4. **Policy** — Allowlist `sponsor`, `cycle`, and `campaign` with small daily caps.
5. **Tier** — Show **Free**; try a premium command in Chat (e.g. reference `create_agent` in narrative) → block; switch to **Pro (mock)** → premium path unblocked.
6. **Chat** — Send `status` (gate skipped); send a sponsored command → pass/fail with **summary** in thread.
7. **Activity** — Show `ProductExecutionRecord` + `OpenClawAudit` JSON; export.
8. **Revocation** — Revoke one allowlisted method; repeat command → policy denial with summary.

**Honesty line for judges**

Read `docs/HACKATHON_PRODUCT_SCOPE.md`: OpenClaw + Aegis execution predates the console; Aeg-control adds the gated product surface, schema, summaries, and mock monetization.
