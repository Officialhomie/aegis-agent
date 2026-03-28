# Railway Verification Report

Generated from automated checks and Railway CLI. Use this to confirm env and endpoints.

---

## 1. Endpoint checks (public)

| Endpoint | URL | Result |
|----------|-----|--------|
| **Health** | `https://aegis-web-production.up.railway.app/api/health` | **503** – `{"status":"initializing","message":"Reserve state not yet available"}` |
| **Redis** | `https://aegis-web-production.up.railway.app/api/health/redis` | **503** – `{"redis":"disconnected","message":"REDIS_URL not set or connection failed"}` |
| **Dashboard status** | `https://aegis-web-production.up.railway.app/api/dashboard/status` | **404** – Page not found (route may live under `src/app`; root `app/` may take precedence) |

**Summary**
- Web app is up and responding.
- Health returns "initializing" because reserve state is not in Redis yet (worker either not writing or web not connected to Redis).
- Redis health reports disconnected: **web service needs a working Redis connection** (REDIS_URL is set in dashboard; if still disconnected after deploy, check Redis service and that web can reach `Redis.railway.internal`).

---

## 2. Railway project status

- **Project:** ClawGas  
- **Environment:** production  
- **Linked service (CLI):** aegis-agent-worker  

---

## 3. Worker service (`aegis-agent-worker`) – env

**Critical vars present:**  
AGENT_MODE=LIVE, EXECUTE_WALLET_PRIVATE_KEY, REDIS_URL, DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY, CDP_*, RPC_URL_BASE, ACTIVITY_LOGGER_ADDRESS, AGENT_NETWORK_ID=base, AEGIS_API_KEY, etc.

**Issue**
- **REACTIVE_OBSERVER_ADDRES** is set (typo). Code expects **REACTIVE_OBSERVER_ADDRESS**.
- **Action:** In Railway → aegis-agent-worker → Variables, add **REACTIVE_OBSERVER_ADDRESS** with value `0x33076cd9353d1285cb9132a94d8d062306096376`, then delete **REACTIVE_OBSERVER_ADDRES**. Or run (CLI uses `--set`, not `set`):
  ```bash
  railway link --service aegis-agent-worker
  railway variables --service aegis-agent-worker --set "REACTIVE_OBSERVER_ADDRESS=0x33076cd9353d1285cb9132a94d8d062306096376"
  ```
  Then remove the typo key **REACTIVE_OBSERVER_ADDRES** in the dashboard.

---

## 4. Web service (`aegis-web`) – env

**Present:**  
REDIS_URL, AGENT_MODE=SIMULATION, PORT=3000, DATABASE_URL, AEGIS_API_KEY, RPC_URL_BASE, RPC_URL_BASE_SEPOLIA, USDC_ADDRESS, AGENT_WALLET_ADDRESS, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL.

**Missing (optional but recommended for full dashboard):**  
ACTIVITY_LOGGER_ADDRESS, REACTIVE_OBSERVER_ADDRESS, AGENT_NETWORK_ID, AEGIS_DASHBOARD_URL, TARGET_RESERVE_ETH, RESERVE_CRITICAL_ETH, USDC_ADDRESS_BASE_MAINNET, ERC8004_NETWORK, and others listed in [RAILWAY_SERVICES_SYNC.md](../RAILWAY_SERVICES_SYNC.md). Add as needed for dashboard features.

**Redis**
- REDIS_URL is set on web. If `/api/health/redis` still returns disconnected after redeploy, verify Redis service is healthy and that the web service can reach the Redis host (e.g. `Redis.railway.internal`).

---

## 5. Checklist

| Item | Status |
|------|--------|
| Worker: AGENT_MODE=LIVE | ✅ |
| Worker: EXECUTE_WALLET_PRIVATE_KEY set | ✅ |
| Worker: REDIS_URL set | ✅ |
| Worker: REACTIVE_OBSERVER_ADDRESS (correct name) | ❌ Fix typo (see §3) |
| Web: AGENT_MODE=SIMULATION | ✅ |
| Web: REDIS_URL set | ✅ |
| Web: PORT=3000 | ✅ |
| Web: No private key | ✅ |
| /api/health reachable | ✅ (503 until reserve state available) |
| /api/health/redis | ⚠️ Disconnected – verify Redis and redeploy if needed |
| Reserve state on health | ⚠️ "initializing" until worker writes to Redis and web reads it |

---

## 6. Commands to re-run verification

```bash
# Health
curl -s https://aegis-web-production.up.railway.app/api/health | jq

# Redis
curl -s https://aegis-web-production.up.railway.app/api/health/redis | jq

# Dashboard status (if route is available)
curl -s https://aegis-web-production.up.railway.app/api/dashboard/status | jq

# Worker vars (after railway link to worker)
railway link --service aegis-agent-worker
railway variables --json | jq 'keys'

# Web vars
railway variables --service aegis-web --json | jq 'keys'

# Worker logs (KeyGuard, LIVE, signing)
railway link --service aegis-agent-worker
railway logs --limit 100
```

---

## 7. Recommended actions

1. **Worker:** Add **REACTIVE_OBSERVER_ADDRESS** with value `0x33076cd9353d1285cb9132a94d8d062306096376` (or your deployed address), then delete **REACTIVE_OBSERVER_ADDRES**.
2. **Redis:** If `/api/health/redis` stays disconnected, confirm Redis service is running, then redeploy web so it picks up REDIS_URL and can reach Redis.
3. **Reserve state:** After Redis is connected and worker has run at least one cycle, `/api/health` should return status/healthScore/balances instead of "initializing".
4. **Web env (optional):** Add missing display/config vars from [RAILWAY_SYNC_COMMANDS.md](../RAILWAY_SYNC_COMMANDS.md) or [RAILWAY_SERVICES_SYNC.md](../RAILWAY_SERVICES_SYNC.md) if you need full dashboard behavior.
