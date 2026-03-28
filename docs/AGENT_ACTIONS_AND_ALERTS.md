# Agent actions and critical alerts

What the agent did, where it’s stored, and what to watch for.

---

## 1. Have we sponsored anybody?

**Only if there are rows in the database table `SponsorshipRecord`.**

- A **sponsorship** is created only when the agent **executes** a `SPONSOR_TRANSACTION` in **LIVE** mode: it signs the decision, logs it on-chain (activity logger), creates a row in `SponsorshipRecord`, then runs the paymaster flow.
- If every cycle ends with **WAIT** (no eligible user, or confidence below threshold, or policy rejected), then **no one has been sponsored** and `SponsorshipRecord` will be empty.

**How to check**

- **API:** `GET /api/dashboard/activity` returns recent `SponsorshipRecord` rows (userAddress, protocolId, decisionHash, txHash, createdAt). Requires the app to be running.
- **Script:**  
  `npx tsx scripts/agent-activity-report.ts`  
  prints total and today’s sponsorships, plus recent decisions and reserve/alert summary.

---

## 2. Where agent actions are stored

| What | Where | Contents |
|------|--------|----------|
| **Executed sponsorships** | DB table `SponsorshipRecord` | Each executed SPONSOR_TRANSACTION: userAddress, protocolId, decisionHash, estimatedCostUSD, txHash, createdAt. |
| **Every decision (including WAIT)** | DB table `Memory` (type = DECISION) | Each cycle decision: action, confidence, reasoning, parameters; outcome (success/fail/readonly); policyErrors if rejected. |
| **On-chain proof** | Activity logger contract | Decision hash and metadata logged on-chain when a sponsorship is executed (see ACTIVITY_LOGGER_ADDRESS). |

So:

- **“All actions the agent worked on”** = all **decisions** (WAIT, SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL, policy rejected, etc.) are in **Memory** with type DECISION. Metadata has `decision`, `outcome`, and optionally `observations`, `policyErrors`.
- **“Actual sponsorships”** = only rows in **SponsorshipRecord** (and corresponding on-chain logs).

---

## 3. Critical alertness – what to watch

These are the main things that can block or change behavior; you see them in **logs** and (where noted) in **state/APIs**.

### Emergency mode (sponsorship halted)

- **When:** Reserve state is updated so that:
  - `ethBalance < criticalThresholdETH` (RESERVE_CRITICAL_ETH), or
  - `runwayDays < 1`, or
  - `forecastedRunwayDays < 3` and `healthScore < 20`.
- **Effect:** `emergencyMode` is set; gas sponsorship **skips** observation and does not sponsor. Reserve pipeline can still run (replenish, etc.).
- **Log:** `[Emergency] Mode changed` with `emergencyMode: true`.
- **Farcaster:** A cast is sent: *"EMERGENCY: Aegis reserves critically low. ETH: X, Runway: Y days. Sponsorship halted."*
- **What to do:** Fund the agent wallet (ETH and/or USDC) so reserves are above the critical threshold and runway recovers.

### Circuit breaker (cycle skipped)

- **When:** Before each cycle, a health check runs. If the agent wallet’s ETH is below `RESERVE_CRITICAL_ETH`, the check fails and the cycle is **skipped**.
- **Log:** `[MultiMode] Health check failed, skipping cycle` with `reason: "Reserve below critical threshold"`.
- **What to do:** Same as emergency: fund the agent wallet so ETH ≥ RESERVE_CRITICAL_ETH (or lower that threshold only for testnet).

### Gas sponsorship skipped (health or emergency)

- **When:** Reserve state exists and either `emergencyMode` is true or `healthScore < GAS_SPONSORSHIP_HEALTH_SKIP_THRESHOLD` (env, default 10).
- **Log:** `[GasSponsorship] Skipping observation: emergency mode active` or `Skipping observation: health score below threshold` with healthScore and threshold.
- **What to do:** Fund reserves to raise health score, or set `GAS_SPONSORSHIP_HEALTH_SKIP_THRESHOLD=0` for testnet so observation is not skipped for low health.

### Policy rejected

- **When:** The decision (e.g. SPONSOR_TRANSACTION) fails policy validation (value limits, gas price, abuse rules, etc.).
- **Log:** `[MultiMode] Policy rejected` with `errors: [...]`.
- **Storage:** A Memory row is still created with the decision and `policyErrors` in metadata.
- **What to do:** Check the logged errors and adjust decision parameters or policy limits.

### Below confidence threshold

- **When:** The model’s confidence for the decision is below the mode’s confidence threshold (e.g. 0.8 for gas sponsorship).
- **Log:** `[MultiMode] Below confidence threshold` with `confidence: X`.
- **Effect:** Decision is **not** executed (no sponsorship, no swap, etc.).
- **What to do:** Normal if the agent correctly chooses not to act; if you expect more actions, check observations and reasoning (e.g. reserve pipeline Zod/LLM issues can force confidence 0).

### ERC-8004 registration failure

- **When:** On startup, the agent tries to register on the ERC-8004 identity registry but the tx fails (e.g. “gas required exceeds allowance (0)”).
- **Log:** `[ERC-8004] ensureAgentRegistered failed` with `error` and optional `hint`.
- **What to do:** Ensure the agent wallet has gas on the correct chain (e.g. Base Sepolia) and that `ERC8004_NETWORK` and RPC are set for that chain. See docs/ERC8004_BASE_SEPOLIA.md.

### Reserve pipeline reasoning failure

- **When:** The reserve decision from the LLM fails validation (e.g. Zod: missing confidence, wrong types) or the LLM call fails.
- **Log:** `[Reason] Reserve pipeline reasoning failed` with error details.
- **Effect:** Fallback decision is WAIT with confidence 0; reserve cycle does not execute an action.
- **What to do:** Check schema/prompt and LLM output; ensure numeric fields and confidence are present and correctly typed.

### Farcaster / Moltbook post failures

- **When:** Neynar or Moltbook API returns an error (e.g. invalid key, rate limit).
- **Log:** `[Farcaster] Failed to publish cast` with `code: FARCASTER_POST_FAILED` and hint, or `[Moltbook] Failed to post insight` with hint (e.g. 30 min rate limit).
- **What to do:** Fix API keys or wait for rate limit; agent continues running without the post.

---

## 4. Quick reference: logs that mean “something important”

| Log pattern | Meaning |
|-------------|--------|
| `[MultiMode] Health check failed, skipping cycle` | Reserve below critical; no cycle run. |
| `[Emergency] Mode changed` | Emergency mode toggled; if true, sponsorship halted. |
| `[GasSponsorship] Skipping observation` | No sponsorship cycle this interval (health or emergency). |
| `[MultiMode] Policy rejected` | Decision blocked by policy; see errors. |
| `[MultiMode] Below confidence threshold` | Decision not executed (low confidence). |
| `[Paymaster] Sponsorship record created` | A real sponsorship was executed and stored. |
| `[ERC-8004] ensureAgentRegistered failed` | On-chain registration failed; wallet may need gas. |
| `[Reason] Reserve pipeline reasoning failed` | Reserve decision invalid/failed; fallback to WAIT. |
| `[CircuitBreaker] Restored persisted state` | Normal: circuit breaker state loaded (CLOSED = ok). |

---

## 5. Getting a full picture of what the agent did

1. **Run the report script**  
   `npx tsx scripts/agent-activity-report.ts`  
   for a summary of sponsorships, recent decisions (from Memory), reserve state, and a short “what to watch” list.

2. **Dashboard (if app is running)**  
   - `GET /api/dashboard/activity` – list of executed sponsorships.  
   - `GET /api/dashboard/stats` – sponsorships today, protocol count, reserve health.

3. **Database**  
   - `SponsorshipRecord` – every executed sponsorship.  
   - `Memory` where `type = 'DECISION'` – every decision (action, confidence, outcome, policyErrors). Order by `createdAt desc` for recent first.

4. **Logs**  
   Search for the patterns in the table above; for executed sponsorships, look for `[Paymaster] Sponsorship record created` and the corresponding `[Farcaster] Sponsorship proof published` (if Farcaster is configured).

This gives you: **whether anyone was sponsored** (SponsorshipRecord + logs), **all actions the agent worked on** (Memory DECISION + logs), and **critical alertness** (emergency, circuit breaker, policy, confidence, ERC-8004, reasoning failures, and social post failures).
