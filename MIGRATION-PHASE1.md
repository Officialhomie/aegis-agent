# Phase 1 Cost Optimization – Migration Guide

This guide covers deploying and verifying the Phase 1 API cost optimizations (Neynar rate limiting, observation filtering, template responses).

## Prerequisites

- **Redis** (recommended): Set `REDIS_URL` for persistent rate limiter and observation state. If not set, the agent falls back to in-memory state (resets on restart, not shared across replicas).
- **Existing env**: No new env vars are required. Continue using `REDIS_URL`, `NEYNAR_API_KEY`, `FARCASTER_SIGNER_UUID` (or `NEYNAR_SIGNER_UUID`) as before.

## New Redis Keys

| Key | Format | TTL | Purpose |
|-----|--------|-----|---------|
| `neynar:monthly:usage` | JSON: `{ month, used, total, lastReset }` | None | Neynar monthly post usage and category budgets |
| `observations:previous` | JSON array of observations | None | Previous cycle observations for change detection |
| `sponsorship:farcaster:counter` | String number | None | Count of sponsorships (post to Farcaster every 42nd) |

## Deployment Steps

1. **Deploy code**  
   - Railway: push to linked branch or run `railway up`.  
   - Or your existing Docker/CI flow.

2. **Verify Redis**  
   ```bash
   railway run npx tsx scripts/check-redis.ts
   ```  
   Or with a local Redis URL:  
   ```bash
   REDIS_URL=redis://... npx tsx scripts/check-redis.ts
   ```

3. **Confirm rate limiter**  
   After the first Farcaster post, the key `neynar:monthly:usage` should exist (e.g. via Redis CLI or your Redis UI).

4. **Monitor logs**  
   - `[ObservationFilter] No significant changes detected` – filter is skipping LLM when stable.  
   - `[TemplateResponse] Gas price too high - WAIT` (or similar) – templates are used.  
   - `[Farcaster] Rate limit reached` – Neynar budget is being enforced.

## Rollback

- **Code**: Revert to the commit before Phase 1; redeploy.
- **State**: To reset Phase 1 state only, delete the three Redis keys above. The app will re-initialize:
  - Filter will treat “no previous” as “has changes” (no harm).
  - Templates still apply if present in code; if reverted, they are gone.
  - Rate limiter will start from zero for the current month.

## Verification Checklist

- **Health**  
  ```bash
  curl -s https://your-app/api/health/deep | jq .
  ```

- **Cost savings API**  
  ```bash
  curl -s https://your-app/api/dashboard/cost-savings | jq .
  ```  
  Expect `neynar`, `llm`, and `estimatedSavings` (or null for neynar if rate limiter/Redis unavailable).

- **Logs**  
  - At least one of: `[ObservationFilter] No significant changes` or `[TemplateResponse] …` during quiet periods.  
  - `[Farcaster] Rate limit reached` when a category budget is hit.

- **Anthropic usage**  
  Compare daily/weekly API usage in the Anthropic dashboard before vs after; expect a drop during stable periods (filter + templates).

## Known Behavioral Changes

- **Farcaster**: Posts drop from on the order of ~30k/month to ~800/month (1 proof per ~42 sponsorships, plus stats/health/emergency within budgets).
- **Quiet periods**: When there are no significant observation changes, the cycle returns a WAIT decision without calling the LLM.
- **Deterministic cases**: High gas, no low-gas wallets, critical reserves swap, or “healthy reserves, few opportunities” use template decisions instead of the LLM.
