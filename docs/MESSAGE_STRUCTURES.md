# Message structures – Moltbook and Farcaster

Exact formats of what gets posted so you can verify and trace failures.

---

## Moltbook

**Rate limits (enforced in code):**
- **Posts:** 1 per 30 minutes (Moltbook API limit). The agent stores `lastMoltbookPost` and only calls the API when ≥30 min have passed.
- **Comments:** 1 per 20 seconds, 50 per day (agent does not comment by default).
- **Upvotes:** no explicit limit in code; we upvote up to 5 relevant posts per heartbeat.

**When we post:** Every Moltbook heartbeat run (default every 30 min) **only if** 30 min have passed since the last post.

### 1. Treasury insight post (heartbeat)

**API:** `POST /api/v1/posts`  
**Body (JSON):**
```json
{
  "submolt": "<MOLTBOOK_SUBMOLT or 'general'>",
  "title": "Aegis Treasury Update",
  "content": "<buildTreasuryInsight(observations)>"
}
```

**`content` (built from observations):**
- Lines from: gas price (`Gas: X Gwei (chain Y)`), ETH/USD price (`ETH/USD: $X`), portfolio (`Portfolio: SYM: balance, ...`).
- If no data: `Treasury observation update – no new data.`
- Otherwise:
```
Aegis treasury update:

Gas: <gasPriceGwei> Gwei (chain <chainId>)
ETH/USD: $<price>
Portfolio: <symbol>: <balance>, ...

(autonomous agent, observe-reason-execute loop)
```

**Response:** `{ "id": "<post_id>", "success": true }`  
**Verify URL (logged):** `https://www.moltbook.com/posts/<id>` (if Moltbook uses this path; otherwise use `postId` from logs).

**Logs on success:**  
`[Moltbook] Posted treasury insight – verify link` with `postId`, `verifyUrl`, `submolt`.

**Logs on failure:**  
`[Moltbook] Failed to post insight (rate limit or API error)` with `error` and optional `hint: "Moltbook allows 1 post per 30 minutes."`

---

## Farcaster (Neynar)

**When we post:**  
- **Health summary:** When `maybePostFarcasterUpdate()` runs and ≥ `FARCASTER_UPDATE_INTERVAL_MS` (default 15 min) have passed since `lastFarcasterPost` in reserve state.  
- **Sponsorship proof:** Once per executed `SPONSOR_TRANSACTION`.  
- **Reserve swap:** When a reserve swap is executed (not covered in detail below).

### 1. Health summary cast

**Source:** `buildHealthSummary(state)` in `transparency/farcaster-updates.ts`.

**Exact message text:**
```
<statusEmoji> Aegis Status Update

Health: <state.healthScore>/100
ETH Reserves: <state.ethBalance.toFixed(4)> ETH
Runway: <state.runwayDays.toFixed(1)> days
Sponsorships (24h): <state.sponsorshipsLast24h>
Burn Rate: <state.dailyBurnRateETH.toFixed(6)> ETH/day

Serving <state.protocolBudgets.length> protocols on Base.

🔗 Dashboard: <NEXT_PUBLIC_APP_URL or AEGIS_DASHBOARD_URL or https://aegis.example.com>
#BasePaymaster #AutonomousAgent #BuildOnBase
```

**Status emoji:** 🟢 if healthScore > 70, 🟡 if > 40, else 🔴.

**Verify URL (logged):** `https://warpcast.com/~/conversations/<castHash>`  
**Logs:** `[Farcaster] Health update published – verify link` with `castHash`, `verifyUrl`.

---

### 2. Sponsorship proof cast (after SPONSOR_TRANSACTION)

**Source:** `postSponsorshipProof()` in `social/farcaster.ts`.

**Exact message text:**
```
⛽ Sponsored execution for agent <truncate(agentWallet)>

Protocol: <protocolId>
Cost: $<costUSD.toFixed(2)>
Gas saved: ~200k units

Reasoning: <truncate(reasoning, 100)>

🔗 View TX: <BASESCAN_TX_URL/txHash or 'N/A'>
📋 Decision: <truncate(decisionHash) or 'N/A'>
<optional: 📄 Decision JSON: IPFS_GATEWAY/ipfs/<ipfsCid>>

#BasePaymaster #AutonomousAgent #BuildOnBase
```

**Embeds (if present):**  
- TX link: `https://basescan.org/tx/<txHash>`  
- Dashboard: `<AEGIS_DASHBOARD_URL>/decisions/<decisionHash>`  
- IPFS: `<IPFS_GATEWAY_URL>/ipfs/<ipfsCid>`

**Verify URLs (logged):**  
- Cast: `https://warpcast.com/~/conversations/<castHash>`  
- TX: `https://basescan.org/tx/<txHash>`

**Logs:** `[Farcaster] Sponsorship proof published – verify link` with `castHash`, `verifyUrl`, `txUrl`, `decisionHash`.

---

### 3. Daily stats cast

**Source:** `postDailyStats()` – not on a timer in the current loop; can be called by other flows.

**Exact message text:**
```
📊 Daily Stats:
• <sponsorshipsToday> autonomous executions sponsored
• <uniqueAgents> autonomous agents served
• <activeProtocols> protocols active
• Total gas saved: $<totalGasSavedUSD.toFixed(2)>
• Reserve: <reserveETH.toFixed(2)> ETH

#BasePaymaster #AutonomousAgent #BuildOnBase
```

---

### 4. Reserve swap cast

**Exact message text:**
```
🔄 Swapped reserves: <amountIn> <tokenIn> → <amountOut> <tokenOut>

<reasoning if present>

🔗 View TX: <basescan URL or 'N/A'>
📋 Decision: <decisionHash slice 0..10>...

#BasePaymaster #BuildOnBase
```

---

## Tracing failures

| Symptom | Where to look | Fix |
|--------|----------------|-----|
| Moltbook "rate limit" or 429 | `[Moltbook] Failed to post insight` – ensure only 1 post per 30 min | Increase `MOLTBOOK_HEARTBEAT_INTERVAL` or wait 30 min |
| Moltbook API error | Same log – `error` and optional `hint` | Check `MOLTBOOK_API_KEY`, Moltbook status |
| Farcaster cast failed | `[Farcaster] Failed to publish cast` | Check `NEYNAR_API_KEY`, `FARCASTER_SIGNER_UUID` |
| No health post | Reserve state may be null or interval not elapsed | Ensure reserve pipeline runs; check `lastFarcasterPost` in state |
| No Moltbook post | `[Moltbook] Post skipped – 30 min minimum interval not elapsed` | Expected; next post after 30 min |

All successful posts log a **verify link** (cast hash URL or Moltbook post ID/URL); use those to confirm what was published.
