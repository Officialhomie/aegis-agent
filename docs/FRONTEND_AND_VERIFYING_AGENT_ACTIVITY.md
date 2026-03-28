# Frontend and verifying agent activity

## How to see the agent’s frontend

There **are** frontends; it’s not only logs.

1. **Start the app** (from `aegis-agent/`):
   ```bash
   npm run dev
   ```
   Default URL: **http://localhost:3000**

2. **Pages you can open**:

   | URL | What it shows |
   |-----|-------------------------------|
   | **http://localhost:3000** | Home: agent status, config (confidence, max value, execution mode), **Run cycle** button to trigger one observe–reason–decide–act cycle. |
   | **http://localhost:3000/dashboard** | **Paymaster dashboard**: sponsorships today, active protocols, reserve health (ETH/USDC), **Verify decision** (by decision hash), **Recent activity** table (sponsorship records from DB). |

3. **Dashboard = source of truth for “did we sponsor?”**  
   - **Real-time stats**: sponsorships today, active protocols, reserve health.  
   - **Recent activity**: rows from `SponsorshipRecord` (user, protocol, decision hash, cost, date).  
   - **Verify decision**: paste a decision hash to check on-chain and signature.

So: **frontend is at `/` and `/dashboard`**. Logs are additional; the dashboard is the main way to see whether sponsorships and reserves are happening.

---

## Why there are no sponsorships and no proofs on Farcaster / Moltbook

### No sponsorships

Sponsorship only happens when **all** of these are true:

1. **Observe** finds at least one candidate (e.g. low-gas wallet that meets observation rules).  
2. **Reason** produces a decision with action `SPONSOR_TRANSACTION` and confidence above threshold.  
3. **Policy** passes (all sponsorship rules).  
4. **Execution mode** is **LIVE** (not `SIMULATION` or `READONLY`).  
5. **Execute** succeeds (paymaster, ActivityLogger, DB write).

If any of these fail, you get **no** sponsorship and **no** DB row:

- **SIMULATION**: decisions and “sponsorship” flow can run, but no real on-chain sponsorship; the code may still write a `SponsorshipRecord` in some paths (e.g. with `txHash: null`). For “real” sponsorships you need **LIVE**.
- No candidates found → cycle finishes with no decision or no `SPONSOR_TRANSACTION`.  
- Policy rejects (e.g. over budget, gas too high, contract not whitelisted) → no execute, no record.  
- RPC / keys / paymaster misconfigured → execute fails, no record.

So “no sponsorships” usually means: no opportunities found, or policy rejected, or SIMULATION/READONLY, or execution failing.

### No proofs on Farcaster

- **Sponsorship proofs** are posted to Farcaster **only when a sponsorship actually runs** and `postSponsorshipProof()` is called (after `sponsorTransaction` in the cycle).
- If **NEYNAR_API_KEY** or **FARCASTER_SIGNER_UUID** is missing, the code **skips** posting and returns success (so no error, but no cast). Check `.env` for both.
- So: **no sponsorships ⇒ no Farcaster proofs.** And missing Neynar/signer ⇒ no proofs even if a sponsorship ran.

### Moltbook

- Moltbook is **not** used for per-sponsorship proofs.
- The agent uses Moltbook for: **heartbeat** (periodic sponsorship activity summaries, feed check, upvotes). So you may see posts like "Aegis sponsored 12 transactions today across 5 protocols" on Moltbook, but **no** individual "I just sponsored wallet X" posts there.
- Sponsorship proofs go to **Farcaster** (and optionally Botchan), not Moltbook.

So: **no sponsorships ⇒ no Farcaster proofs; Moltbook will only show periodic activity summaries, not individual sponsorship proofs.**

---

## How to determine if the agent is performing as intended

Use a mix of **UI, DB, logs, and env**.

### 1. Dashboard (primary check)

- Open **http://localhost:3000/dashboard**.
- **Sponsorships today** and **Recent activity**:  
  - If the agent is sponsoring, you’ll see counts and rows.  
  - If both are always 0/empty, either no cycles are running, or no sponsorship is being executed (observe/policy/execution as above).
- **Reserve health**: confirms the app can read the agent wallet’s ETH/USDC (RPC + `AGENT_WALLET_ADDRESS` / reserve config).

### 2. Run a cycle from the UI

- On **http://localhost:3000**, set **Execution mode** to **LIVE** (for real txs) or **SIMULATION** (for dry run), then click **Run cycle**.
- Check the JSON result: `observationsCount`, `currentDecision`, `hasExecutionResult`.  
- If `currentDecision` is null or action is not `SPONSOR_TRANSACTION`, the agent didn’t decide to sponsor (observe or reason).  
- If there is a decision but `hasExecutionResult` is false or you see an error, execution or policy failed.

### 3. Logs (when running the agent process)

- If you run **`npm run agent:start`** (or the script that runs the multi-mode agent), watch logs for:
  - `[Aegis] Observing Base for sponsorship opportunities...`
  - `[MultiMode] Policy rejected` / `Below confidence threshold` → no execution.
  - `[Paymaster] Sponsorship record created` → DB row written.
  - `[Farcaster] Sponsorship proof published` → proof cast.
  - Any `[Farcaster] NEYNAR_API_KEY or FARCASTER_SIGNER_UUID not set - skipping cast` → proofs will never post until you set both in `.env`.

### 4. Database

- **SponsorshipRecord** table: each real sponsorship should create a row (userAddress, protocolId, decisionHash, estimatedCostUSD, txHash, etc.).  
- Query or use **Prisma Studio** (`npx prisma studio`) to confirm whether any rows exist and whether `txHash` is set (on-chain) or null (simulation/failed).

### 5. Environment and config

- **AGENT_EXECUTION_MODE**: must be **LIVE** for real sponsorships.  
- **NEYNAR_API_KEY** and **FARCASTER_SIGNER_UUID**: both set if you want Farcaster proofs.  
- **RPC, ACTIVITY_LOGGER_ADDRESS, agent wallet keys**: required for observe + execute (see `docs/ENV_SETUP_GUIDE.md`).

### 6. On-chain and verify

- **Dashboard → Verify decision**: paste a decision hash from a run; the app checks on-chain and signature.  
- If you have a `txHash` from **Recent activity**, open it on Basescan to confirm the transaction.

---

## Summary

| Question | Answer |
|----------|--------|
| How do I see the agent’s frontend? | Run `npm run dev`, open **http://localhost:3000** (home) and **http://localhost:3000/dashboard** (paymaster stats + activity + verify). |
| Are there any frontends or just logs? | There are two UIs: home (status + run cycle) and dashboard (stats, activity, verify). Logs are extra. |
| Why no sponsorships? | No opportunities found, or policy rejected, or SIMULATION/READONLY, or execution (RPC/keys/paymaster) failing. Use dashboard + “Run cycle” + logs to see which. |
| Why no proofs on Farcaster/Moltbook? | Farcaster: proofs only when a sponsorship runs **and** NEYNAR_API_KEY + FARCASTER_SIGNER_UUID are set. Moltbook: posts periodic sponsorship activity summaries (24h), not individual proofs. |
| How do I know the agent is working? | Dashboard (sponsorships today, recent activity, reserve health), Run cycle result (decision + execution), logs, DB (`SponsorshipRecord`), and Verify decision / Basescan. |
