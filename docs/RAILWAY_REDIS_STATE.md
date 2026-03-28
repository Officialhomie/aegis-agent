# Redis state sync on Railway

Worker, web, and any spawned processes (e.g. campaign script) must use the **same** Redis instance so state (campaigns, reserve, rate limits, circuit breaker) is shared. Without Redis, the app falls back to in-memory state per process and will fail startup in production.

## Checklist

1. **Add Redis in Railway**  
   Railway Dashboard → your project → New → Database → Redis (or add the Redis plugin). Note the service name (e.g. `Redis`).

2. **Set REDIS_URL on both services**  
   For **worker** and **web**, set the variable so both point at the same Redis:
   - **Option A (recommended):** In Dashboard → Variables for each service, add:
     - `REDIS_URL` = `${{ Redis.REDIS_URL }}`  
     (Replace `Redis` with your Redis service name if different.)
   - **Option B:** Sync from local `.env` to both services in one run:
     ```bash
     cd aegis-agent
     npx tsx scripts/sync-railway-env.ts --all-services
     ```
     Ensure `.env` has a valid `REDIS_URL` (e.g. the internal URL Railway provides, or a public Redis URL). Run without `--all-services` to sync only the currently linked service.

3. **Verify both services have the same REDIS_URL**
   ```bash
   railway variables --service aegis-agent-worker | grep REDIS_URL
   railway variables --service aegis-web | grep REDIS_URL
   ```
   Both should show the same Redis URL (e.g. `redis://...@Redis.railway.internal:6379`).

4. **Verify Redis connectivity**
   ```bash
   curl https://<your-web-url>.up.railway.app/api/health/redis
   ```
   Expected: `{"redis":"connected"}`. If you get `503` or `"redis":"disconnected"`, check that the Redis service is healthy and that REDIS_URL is set on the web service; redeploy if needed.

## REDIS_URL: dashboard vs sync script

- **set-railway-vars.js** skips `REDIS_URL` (expects it to be set as a reference in the dashboard, e.g. `${{ Redis.REDIS_URL }}`).
- **sync-railway-env.ts** includes `REDIS_URL` in the keys it syncs. Use it when you want to push a literal URL from `.env` to Railway. With `--all-services`, the same URL is set on both worker and web in one run.

In production (and when running on Railway), the app **requires** REDIS_URL and will not start without it.

## Without Redis

Campaign status, reserve state, and shared rate-limit/circuit state will not be visible across services or restarts if REDIS_URL is missing; the app will also fail startup in production.
