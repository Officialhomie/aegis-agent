# Step 5: Infrastructure Deployment (Railway)

This doc aligns your **existing Railway deployment** with [PRODUCTION_DEPLOYMENT.md §5](../PRODUCTION_DEPLOYMENT.md#5-infrastructure-deployment) and lists everything to verify so you're good to go.

---

## Architecture (current setup)

You run **two services + Redis** on Railway:

| Component | Purpose | Start command | Public URL |
|-----------|---------|----------------|------------|
| **aegis-agent-worker** | Agent loop (observe, reason, execute, sign) | `npx tsx scripts/run-agent.ts` | No (internal) |
| **aegis-web** | Next.js dashboard + API (health, status) | `npm run start` | Yes (e.g. `aegis-web-production.up.railway.app`) |
| **Redis** | Shared state (reserve state, locks, circuit breaker) | Railway template | Internal |

- **Worker** has `EXECUTE_WALLET_PRIVATE_KEY` and `AGENT_MODE=LIVE`; it writes reserve state to Redis and runs the agent.
- **Web** has no private key and `AGENT_MODE=SIMULATION`; it reads from Redis and serves the dashboard.
- Both must have **REDIS_URL** pointing to the same Redis instance (e.g. `${{ Redis.REDIS_URL }}` in Railway).

---

## Configuration files (already in repo)

| File | Purpose |
|------|---------|
| **railway.toml** | Build = Dockerfile; deploy = restart on failure. |
| **Dockerfile** | Node 22, Prisma generate + build, `CMD npm run start`. Worker overrides CMD in Railway dashboard. |
| **railway-env-template.txt** | Full list of env vars for Railway (worker + web). |
| **RAILWAY_DEPLOYMENT.md** | Full Railway guide (signing, vars, verify). |
| **RAILWAY_STEPS.md** | CLI steps, Redis, Start Command, verify URLs. |
| **RAILWAY_SERVICES_SYNC.md** | Two-service + Redis design, sync checklist. |
| **RAILWAY_SYNC_COMMANDS.md** | Commands to sync vars and verify worker/web. |
| **scripts/sync-railway-services.sh** | Compare vars and check logs. |

---

## Verification checklist (are we good to go?)

### Build & deploy

- [ ] **railway.toml** – `builder = "dockerfile"`, optional `dockerfilePath = "Dockerfile"` (defaults to root Dockerfile).
- [ ] **Dockerfile** – Node 22+, `prisma generate` + `npm run build`, `EXPOSE 3000`, `CMD ["npm", "run", "start"]`. Worker overrides CMD in dashboard.
- [ ] **Worker** – In Railway: Settings → Deploy → **Start Command** = `npx tsx scripts/run-agent.ts` (overrides Dockerfile CMD).
- [ ] **Web** – No override, or explicitly `npm run start`; **PORT** = `3000` (Railway sets this by default).

### Redis (required for reserve state sync)

- [ ] **Redis** – Added to project (e.g. from Railway template/marketplace).
- [ ] **Worker** – Variable **REDIS_URL** = `${{ Redis.REDIS_URL }}` (replace `Redis` with your Redis service name if different).
- [ ] **Web** – Same **REDIS_URL** so dashboard can read reserve state.

### Worker env (LIVE mode, signing)

- [ ] **EXECUTE_WALLET_PRIVATE_KEY** – Set (secret); from `cast wallet private-key --account aegis-agent`.
- [ ] **AGENT_MODE** = `LIVE`.
- [ ] **DATABASE_URL**, **DIRECT_URL** – Supabase (or other Postgres); app uses pooler, CLI uses direct.
- [ ] **ANTHROPIC_API_KEY**, **USE_CLAUDE_REASONING**, **ANTHROPIC_REASONING_MODEL**.
- [ ] **RPC_URL_BASE** (Base mainnet), **RPC_URL_BASE_SEPOLIA** if using testnet; **BUNDLER_RPC_URL** (e.g. Pimlico for 8453).
- [ ] **CDP_API_KEY_NAME**, **CDP_API_KEY_PRIVATE_KEY** (AgentKit).
- [ ] **ACTIVITY_LOGGER_ADDRESS**, **REACTIVE_OBSERVER_ADDRESS** (from Step 2).
- [ ] **AGENT_NETWORK_ID** = `base` for mainnet (8453) or `base-sepolia` for testnet (84532).
- [ ] **AGENT_WALLET_ADDRESS**, **USDC_ADDRESS** / **USDC_ADDRESS_BASE_MAINNET**, **AEGIS_API_KEY**, **BASESCAN_API_KEY**.
- [ ] Optional: Neynar, Farcaster, Moltbook, x402, REACTIVE_CALLBACK_SECRET, etc. (see railway-env-template.txt).

### Web env (read-only dashboard)

- [ ] **REDIS_URL** (same as worker).
- [ ] **PORT** = `3000`.
- [ ] **AGENT_MODE** = `SIMULATION` (or unset).
- [ ] **No EXECUTE_WALLET_PRIVATE_KEY** on web.
- [ ] Same display/config vars as worker where needed: **AGENT_WALLET_ADDRESS**, **ACTIVITY_LOGGER_ADDRESS**, **RPC_URL_BASE**, **ANTHROPIC_API_KEY**, **AGENT_NETWORK_ID**, **AEGIS_DASHBOARD_URL**, **TARGET_RESERVE_ETH**, **RESERVE_CRITICAL_ETH**, **USDC_ADDRESS_BASE_MAINNET**, CDP/social if dashboard uses them (see RAILWAY_SERVICES_SYNC.md and RAILWAY_SYNC_COMMANDS.md).

### Base mainnet (production)

- [ ] **AGENT_NETWORK_ID** = `base` (not `base-sepolia`) on worker.
- [ ] **REACTIVE_OBSERVER_ADDRESS** set (deployed on Base mainnet in Step 2).
- [ ] **ACTIVITY_LOGGER_ADDRESS** set (Base mainnet).
- [ ] **RPC_URL_BASE** and **BUNDLER_RPC_URL** point to Base mainnet (chain 8453).
- [ ] **USDC_ADDRESS_BASE_MAINNET** = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

### Health & verification

Run these after deploy:

```bash
# Web health (reserve state from Redis)
curl https://YOUR-WEB-URL.up.railway.app/api/health

# Redis connection (web)
curl https://YOUR-WEB-URL.up.railway.app/api/health/redis
# Expected: {"redis":"connected"}

# Dashboard status (web should be SIMULATION, canSign false)
curl https://YOUR-WEB-URL.up.railway.app/api/dashboard/status
# Expected: {"mode":"SIMULATION","canSign":false,"signingMethod":"none","hasWallet":false}
```

**Worker logs** (Railway dashboard or CLI):

```bash
railway link --service aegis-agent-worker
railway logs --limit 100
```

Look for:

- `[RunAgent] Initializing KeyGuard...`
- `[KeyGuard] Signing key available via env_execute`
- `Mode: LIVE`, `Signing capability: YES`
- `[RunAgent] Starting unified agent...`

---

## Summary: good to go?

| Area | What to check |
|------|----------------|
| **Config** | railway.toml + Dockerfile present; worker Start Command = `npx tsx scripts/run-agent.ts`. |
| **Redis** | Redis service exists; both worker and web have **REDIS_URL** = `${{ Redis.REDIS_URL }}`. |
| **Worker** | LIVE, EXECUTE_WALLET_PRIVATE_KEY, DB, RPC, CDP, contract addresses, **REACTIVE_OBSERVER_ADDRESS**, **AGENT_NETWORK_ID**=base for mainnet. |
| **Web** | SIMULATION, no private key, REDIS_URL, PORT 3000, same display vars as needed. |
| **Mainnet** | AGENT_NETWORK_ID=base, REACTIVE_OBSERVER_ADDRESS + ACTIVITY_LOGGER_ADDRESS set, mainnet RPC/Bundler. |
| **Verify** | /api/health, /api/health/redis, /api/dashboard/status; worker logs show KeyGuard + LIVE + signing. |

If all of the above are done, you're up to date with Step 5 and good to go on Railway.

---

## References

- [PRODUCTION_DEPLOYMENT.md §5 – Infrastructure Deployment](../PRODUCTION_DEPLOYMENT.md#5-infrastructure-deployment)
- [RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md) – Full deployment and signing
- [RAILWAY_STEPS.md](../RAILWAY_STEPS.md) – CLI steps, Redis, Start Command
- [RAILWAY_SERVICES_SYNC.md](../RAILWAY_SERVICES_SYNC.md) – Two-service + Redis design
- [RAILWAY_SYNC_COMMANDS.md](../RAILWAY_SYNC_COMMANDS.md) – Sync and verify commands
- **railway-env-template.txt** – Env vars for Railway (worker + web)
- **scripts/sync-railway-services.sh** – Compare vars and check logs

Next: [Step 6 – Agent Configuration](../PRODUCTION_DEPLOYMENT.md#6-agent-configuration).
