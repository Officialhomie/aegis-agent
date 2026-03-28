# Where the agent’s past actions (Moltbook / Farcaster) are tracked

This file points to where “past actions” for Moltbook and Farcaster are stored and used in the codebase.

## Moltbook

- **Last run / last post timestamps** (when we last checked the feed and when we last posted)  
  - **File:** `aegis-agent/src/lib/agent/social/heartbeat.ts`  
  - **Keys:** `lastMoltbookCheck`, `lastMoltbookPost`  
  - **Storage:** State store from `getStateStore()` (Redis if `REDIS_URL` is set, otherwise in-memory).  
  - **Usage:**  
    - `shouldRunMoltbookHeartbeat()` uses `store.get(MOLTBOOK_CHECK_KEY)` (line ~30).  
    - `canPostToMoltbook()` uses `store.get(MOLTBOOK_POST_KEY)` (line ~42).  
    - `setLastMoltbookPost()` / last check update use `store.set(...)` (lines ~51, ~59).

- **Agent identity (Moltbook registration)**  
  - **Schema:** `prisma/schema.prisma` – `Agent` model fields: `moltbookApiKey`, `moltbookAgentName`, `moltbookClaimedAt`.  
  - **Registration script:** `scripts/register-moltbook.ts` (e.g. `npm run register:moltbook`).

- **Actual “past actions” (posts, upvotes)** are not stored in our DB; the agent only tracks last-check and last-post timestamps for throttling. Moltbook’s API/site holds the real post history.

## Farcaster

- **Last Farcaster post time** (throttling for health updates)  
  - **File:** `aegis-agent/src/lib/agent/state/reserve-state.ts`  
  - **Field:** `lastFarcasterPost: string | null` on `ReserveState`.  
  - **Storage:** Reserve state is persisted under key `aegis:reserve_state` via `getStateStore()` (same Redis/memory store).  
  - **Usage:**  
    - `maybePostFarcasterUpdate()` in `aegis-agent/src/lib/agent/transparency/farcaster-updates.ts` reads `getReserveState()`, then `state.lastFarcasterPost` (lines ~25–26), and after posting calls `updateReserveState({ lastFarcasterPost: ... })` (line ~30).

- **Sponsorship proofs** are posted via `postSponsorshipProof()` in `aegis-agent/src/lib/agent/social/farcaster.ts`; we do not persist a list of past casts in our DB, only the last health-post time in reserve state.

- **Actual past casts** live on Farcaster/Warpcast; our code only stores the last post timestamp for rate limiting.

## Summary

| Platform   | What we store                         | Where (file / store)                                      |
|-----------|---------------------------------------|-----------------------------------------------------------|
| Moltbook  | Last check time, last post time       | State store keys in `heartbeat.ts`; `getStateStore()`     |
| Moltbook  | Agent registration (API key, name)    | Prisma `Agent` model; `register-moltbook.ts`              |
| Farcaster | Last health post timestamp            | `ReserveState.lastFarcasterPost` in `reserve-state.ts`    |
| Farcaster | No list of past casts                 | N/A – only last post time for throttling                  |
