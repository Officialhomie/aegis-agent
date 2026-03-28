# Aegis Agent - Complete Documentation

> A comprehensive guide to everything the Aegis Agent can do, how it works, and how to maximize its capabilities.
>
> **Version:** 3.0 (includes OpenClaw Phase 2, Gas Passport V2, Execution Guarantees, v1 protocol onboarding) · **Last updated:** February 2026

---

## Table of Contents

1. [What & Why (Non-Technical)](#what--why-non-technical)
2. [Architecture & Flow (Technical)](#architecture--flow-technical)
3. [Frontend & UX](#frontend--ux)
4. [Backend & API](#backend--api)
5. [Data & Persistence](#data--persistence)
6. [Integrations & External Systems](#integrations--external-systems)
7. [Security, Config & Ops](#security-config--ops)
8. [Skills & Extensibility](#skills--extensibility)
9. [Contracts & Chain](#contracts--chain)
10. [Agent-to-Agent Interactions](#agent-to-agent-interactions)
11. [Complete Capabilities Reference](#complete-capabilities-reference)

---

## What & Why (Non-Technical)

### 1. What does Aegis do in one sentence?

**Aegis is an autonomous AI agent that sponsors gas fees for legitimate users on Base, enabling gasless transactions for protocols and their users.**

It runs a continuous observe-reason-execute loop to identify users who need gas, verify their legitimacy, and sponsor their transactions via ERC-4337 account abstraction.

---

### 2. Who is it for?

| Audience | How Aegis Helps |
|----------|-----------------|
| **Protocols** | Sponsor their users' gas without manual ops. Pay $0.50 per sponsored tx via x402 prepayment. |
| **End Users** | Get transactions sponsored without needing ETH for gas. Zero friction onboarding. |
| **Other AI Agents** | Request sponsorship via Botchan. Collaborate on Moltbook. Get reputation attestations. |
| **Developers** | API endpoints to trigger cycles, register protocols, verify decisions. |

---

### 3. What problem does it solve?

**The Gas Fee Barrier Problem:**
- 60% of new users abandon Web3 apps because they need ETH for gas
- Users must acquire ETH before doing anything on-chain
- Protocols lose users at the first transaction hurdle

**Aegis Solution:**
- Protocols prepay for sponsorships ($0.50 each)
- Aegis monitors for low-gas wallets interacting with sponsored protocols
- Legitimate users get gas covered automatically
- ROI for protocols: 200-2000x (spend $0.50 to acquire user worth $100-$1000)

---

### 4. What does "paymaster" mean in this project?

**Paymaster** refers to the ERC-4337 Account Abstraction pattern where a third party (Aegis) pays gas on behalf of users.

| Component | Role |
|-----------|------|
| **User** | Signs a UserOperation (not a traditional tx) |
| **Bundler** | Aggregates UserOperations and submits to EntryPoint |
| **Paymaster (Aegis)** | Signs to approve gas sponsorship, pays the bundler |
| **EntryPoint** | On-chain contract that validates and executes UserOperations |

**How it's configured:**
- `BUNDLER_RPC_URL` - Pimlico bundler endpoint (default)
- `BUNDLER_PROVIDER=coinbase` and `COINBASE_BUNDLER_RPC_URL` - Use Coinbase CDP as bundler/paymaster instead of Pimlico
- `ENTRY_POINT_ADDRESS` - v0.7 EntryPoint contract (empty = default)
- Agent wallet signs paymaster approval

**Real sponsored UserOp:** For CDP (and strict paymasters) to accept a UserOperation, the agent sends non-empty calldata: it encodes `execute(targetContract, 0, 0x)` for the sponsored 4337 account. The target is chosen from the decision’s `targetContract` (if in the protocol whitelist), or the protocol’s first allowlisted contract, or `ACTIVITY_LOGGER_ADDRESS`. The sponsored address must be a 4337 smart account, and the target must be allowlisted in the CDP Paymaster policy.

---

### 5. What's the difference between "reserve pipeline" and "gas sponsorship" mode?

| Aspect | Reserve Pipeline Mode | Gas Sponsorship Mode |
|--------|----------------------|---------------------|
| **Purpose** | Manage agent's own treasury | Sponsor user transactions |
| **Focus** | Supply-side (inflows) | Demand-side (outflows) |
| **Interval** | Every 5 minutes | Every 60 seconds |
| **Actions** | REPLENISH_RESERVES, ALLOCATE_BUDGET, REBALANCE_RESERVES, ALERT_LOW_RUNWAY | SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL |
| **Observes** | Burn rate, runway, pending payments, reserve health | Low-gas wallets, protocol budgets, gas prices |

**They run concurrently** in a single process via `MultiModeAgent`, with isolated circuit breakers and rate limiters per mode.

---

## Architecture & Flow (Technical)

### 6. What is the main loop the agent runs?

```
┌─────────────────────────────────────────────────────────────────┐
│                     AEGIS AGENT LOOP (ORPEM)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. OBSERVE ────► Gather data from chain, oracles, APIs        │
│       │                                                         │
│       ▼                                                         │
│  2. REASON ─────► LLM analyzes observations + memories         │
│       │           Outputs: action, confidence, reasoning        │
│       ▼                                                         │
│  3. POLICY ─────► Validate decision against safety rules       │
│       │           (budget, rate limits, gas price, etc.)        │
│       ▼                                                         │
│  4. EXECUTE ────► If policy passes + confidence high enough:   │
│       │           Sign, submit tx, log to ActivityLogger        │
│       ▼                                                         │
│  5. MEMORY ─────► Store decision + outcome for learning        │
│       │           (Postgres + Pinecone vectors)                 │
│       ▼                                                         │
│  [Loop repeats every 60s for sponsorship, 5min for reserves]   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. How does the agent decide to sponsor a transaction?

**Step-by-step decision flow:**

1. **Observe** - Gather:
   - Low-gas wallets (< 0.0001 ETH) from Blockscout
   - Failed transactions (gas issues)
   - New wallet activations
   - Protocol budgets and whitelisted contracts
   - Current gas prices
   - Agent's own ETH/USDC reserves

2. **Reason** - LLM (GPT-4 or Claude) evaluates:
   - User legitimacy (5+ historical txs, no abuse flags)
   - Protocol budget availability
   - Gas price conditions (max Gwei configurable per protocol, including via OpenClaw runtime override)
   - Outputs decision with confidence score

3. **Policy Check** - 14 sponsorship rules (in `src/lib/agent/policy/sponsorship-rules.ts`):
   - protocol-onboarding-status, runtime-pause-check, runtime-blocked-wallet-check
   - user-legitimacy-check (e.g. 5+ historical txs or Gas Passport), approved-agent-check
   - protocol-budget-check, agent-reserve-check (0.1+ ETH)
   - daily-cap-per-user (3/day), global-rate-limit (10/min), per-protocol-rate-limit (5/min)
   - per-sponsorship-cost-cap ($0.50), contract-whitelist-check, gas-price-optimization (max Gwei from runtime override &gt; config &gt; env; default e.g. 2 Gwei)

4. **Execute** - If all pass:
   - Sign decision with ECDSA
   - Upload proof to IPFS
   - Submit via Pimlico bundler
   - Log to ActivityLogger contract
   - Deduct from protocol budget
   - Post proof to Farcaster/Botchan

---

### 8. Where does the agent get its "observations" from?

| Source | Data Gathered | File |
|--------|---------------|------|
| **Blockchain (viem)** | Block number, gas price, balances, contract state | `observe/blockchain.ts` |
| **Blockscout API** | Low-gas wallets, failed txs, new activations, tx history | `observe/sponsorship.ts` |
| **Chainlink Oracles** | ETH/USD, BTC/USD prices | `observe/oracles.ts` |
| **CoinGecko API** | Price fallback when Chainlink fails | `observe/oracles.ts` |
| **Database (Prisma)** | Protocol budgets, spending history, memories | `observe/sponsorship.ts` |
| **Botchan Feeds** | Agent requests from other agents | `observe/botchan.ts` |
| **Treasury State** | Token balances, risk metrics, positions | `observe/treasury.ts` |

**Supported chains:** Base, Base Sepolia, Mainnet, Sepolia (configurable via `SUPPORTED_CHAINS`)

---

### 9. What is "multi-mode" and how do the modes run?

**MultiModeAgent** orchestrates both modes in a single Node.js process:

```typescript
// Intervals
Reserve Pipeline:  Every 5 minutes
Gas Sponsorship:   Every 60 seconds
Social/Skills:     Every 15 minutes

// Each mode has:
- Isolated circuit breaker (fails independently)
- Isolated rate limiter
- Own observation set
- Own reasoning prompt
- Shared execution infrastructure
```

**Startup sequence:**
1. Check emergency mode
2. Register skills
3. Run initial reserve cycle
4. Run initial sponsorship cycle
5. Start interval timers (reserve 5 min, sponsorship 60 s)
6. Start social/heartbeat timer (15 min)
7. Start queue consumer (30 s) for sponsorship request queue

---

### 10. How is the agent wallet loaded?

**Two methods (in priority order):**

1. **Foundry Keystore (Recommended)**
   ```env
   KEYSTORE_ACCOUNT=deployer-onetruehomie
   KEYSTORE_PASSWORD=your-password
   ```
   - Encrypted keystore in `~/.foundry/keystores/`
   - More secure, no plaintext keys

2. **Environment Variable (Fallback)**
   ```env
   EXECUTE_WALLET_PRIVATE_KEY=0x...
   # or
   AGENT_PRIVATE_KEY=0x...
   ```
   - Less secure, but simpler for development

**Loading code:** `src/lib/keystore.ts`

---

## Frontend & UX

### 11. What can you do on the main app (home) page?

**URL:** `http://localhost:3000`

The **home page** (`/`) is the **public landing page**. It presents what Aegis does, who it is for, how it works, and high-level stats. It includes: Hero, How it works, Stats, For Protocols, For Agents, and Footer. There is no Run Cycle or mode selection on the home page.

**Agent control** (Run Cycle, configuration, execution mode) lives on the **Admin page** at `http://localhost:3000/admin`. From there you can trigger a cycle, set confidence threshold and max value, and choose LIVE / SIMULATION / READONLY. The dashboard at `/dashboard` provides real-time stats, activity, and verification.

---

### 12. What does the dashboard show?

**URL:** `http://localhost:3000/dashboard`

| Section | Data Shown |
|---------|------------|
| **Sponsorships Today** | Count of successful sponsorships in last 24h |
| **Active Protocols** | Number of protocols with budget > 0 |
| **Reserve Health** | ETH and USDC balances across chains |
| **Recent Activity** | Table of SponsorshipRecords (user, protocol, cost, tx hash) |
| **Verify Decision** | Paste decision hash to verify on-chain + signature |
| **Execution Guarantees** | Active/total guarantees, total locked amount, SLA compliance %, recent breaches; "View All" links to `/dashboard/guarantees`, "Create Guarantee" when empty |
| **Chain Balances** | When available, ETH/USDC per chain for reserve health |

**Guarantees list:** At `/dashboard/guarantees` you can see all execution guarantees (status, tier, budget utilization, SLA stats) and link to each guarantee's detail page.

**Guarantee detail:** At `/dashboard/guarantees/[id]` you can view a single guarantee (budget, SLA, financial, validity), see usage history (userOpHash, txHash, cost, latency, SLA met), and cancel the guarantee.

---

### 13. How do we know "reserve health" across chains?

**Data sources:**
- `observeAgentWalletBalances()` - Queries ETH + USDC balances on all supported chains
- Chains configured via `SUPPORTED_CHAINS` env (default: Base Sepolia)

**What "healthy" means:**
| Metric | Healthy | Degraded | Critical |
|--------|---------|----------|----------|
| ETH Balance | > 0.1 ETH | 0.05-0.1 ETH | < 0.05 ETH |
| USDC Buffer | > 20% of target | 10-20% | < 10% |
| Runway | > 7 days | 3-7 days | < 3 days |

---

### 14. How can someone verify a past sponsorship decision?

1. Go to Dashboard → **Verify Decision**
2. Paste the `decisionHash` (from activity table or logs)
3. System checks:
   - On-chain log in ActivityLogger contract
   - ECDSA signature validity
   - IPFS metadata retrieval
4. Returns: verified/invalid, signer address, decision details

---

## Backend & API

### 15. What are the main API routes and what do they do?

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/agent/cycle` | POST | Trigger one agent cycle manually | Bearer token |
| `/api/agent/status` | GET | Health check, uptime | Bearer token |
| `/api/agent/register` | POST | Register agent on ERC-8004 | Bearer token |
| `/api/agent/price` | GET | x402 pricing info | None |
| `/api/protocol` | GET | List all protocols | None |
| `/api/protocol/register` | POST | Register new protocol | None |
| `/api/protocol/[id]` | GET | Get protocol details | None |
| `/api/protocol/[id]/topup` | POST | Add budget to protocol | None |
| `/api/protocol/webhook` | POST | x402 payment notification | Signature |
| `/api/dashboard/stats` | GET | Daily stats | None |
| `/api/dashboard/activity` | GET | Recent sponsorships | None |
| `/api/dashboard/verify` | POST | Verify decision hash | None |
| `/api/reactive/event` | POST | Reactive Network callback | HMAC |
| `/api/botchan/webhook` | POST | Botchan agent requests | HMAC |
| `/api/openclaw` | GET | OpenClaw manifest (commands, endpoints) | None |
| `/api/openclaw` | POST | OpenClaw command (status, cycle, pause, etc.) | Bearer token |
| `/api/health` | GET | Simple ping | None |
| `/api/health/deep` | GET | Full health (DB, Redis, chain) | None |
| `/api/health/redis` | GET | Redis connectivity | None |
| `/api/v1/protocol/register` | POST | Self-serve protocol registration; returns API key, 30-day simulation | None |
| `/api/v1/protocol/[id]/onboarding-status` | GET | Protocol onboarding status, CDP state, next actions | API key (Bearer) |
| `/api/v1/protocol/[id]/policy` | POST | Update protocol policy config (budget, gas cap, etc.) | API key (Bearer) |
| `/api/v1/protocol/[id]/stats` | GET | Protocol stats | API key or None (per impl.) |
| `/api/v1/passport` | GET | Gas Passport by query `?agent=0x...` or `?agentOnChainId=...` | None |
| `/api/v1/passport/[address]` | GET | Gas Passport V2 by address; `?format=full\|summary\|display`, `refresh`, `identity` | None |
| `/api/v1/guarantees` | POST | Create execution guarantee | Bearer token |
| `/api/v1/guarantees` | GET | List guarantees (optional protocolId) | Bearer token |
| `/api/v1/guarantees/[id]` | GET | Get guarantee details | Bearer token |
| `/api/v1/guarantees/[id]` | DELETE | Cancel guarantee | Bearer token |
| `/api/v1/guarantees/[id]/usage` | GET | Guarantee usage history (paginated) | Bearer token |
| `/api/internal/cdp/batch-submit` | POST | Submit protocols to CDP allowlist (Aegis ops) | Internal API key |
| `/api/internal/cdp/mark-approved` | POST | Mark protocols CDP-approved, transition to LIVE | Internal API key |

**Also available:** `POST /api/v1/sponsorship/request`, `GET /api/v1/sponsorship/check-eligibility`; delegation APIs (`/api/delegation`, `/api/delegation/[delegationId]`, `/api/delegation/[delegationId]/usage`); protocol agents (`/api/protocol/[protocolId]/agents`, `/api/protocol/[protocolId]/deposit-verify`). v1 protocol routes use the protocol's **API key** (Bearer); internal CDP routes use **AEGIS_INTERNAL_API_KEY**.

---

### 16. How does the agent get triggered to run a cycle?

| Trigger | How It Works |
|---------|--------------|
| **Interval Timer** | `MultiModeAgent.start()` sets intervals (60s sponsorship, 5min reserves) |
| **Manual API** | `POST /api/agent/cycle` with Bearer token |
| **Reactive Network** | Webhook to `/api/reactive/event` on treasury events |
| **Startup** | Initial cycles run immediately on `npm run agent:start` |

---

### 17. What does the protocol API do?

**Canonical self-serve flow (v1):**

1. **Register** - `POST /api/v1/protocol/register`
   - Request body: `protocolId`, `name`, `notificationEmail`, `notificationWebhook` (optional), `initialDepositTxHash`, `whitelistedContracts` (optional), `estimatedMonthlyVolume`.
   - Response includes an **API key** (show once; store securely) and a 30-day simulation window. Protocol is created with onboarding status APPROVED_SIMULATION; no manual approval required to start simulation.
   - No `initialBalanceUSD` in v1; deposit is attested via `initialDepositTxHash`.

2. **Onboarding status** - `GET /api/v1/protocol/:id/onboarding-status` (API key required)
   - Returns onboarding status, CDP allowlist state, whether simulation is allowed, whether protocol is LIVE, next actions, and events. Use for dashboard and support.

3. **Policy config** - `POST /api/v1/protocol/:id/policy` (API key required)
   - Update per-protocol policy: `dailyBudgetUSD`, `gasPriceMaxGwei`, `maxSponsorshipsPerDay`, `whitelistedContracts`, `blacklistedWallets`. Merges with existing config.

4. **Transition to LIVE** - After CDP allowlist approval, Aegis ops use internal endpoints `POST /api/internal/cdp/mark-approved` to set protocols to LIVE so they can execute real sponsorships.

**Legacy / other:** `POST /api/protocol/register` may exist with a different schema. Top-up via `POST /api/protocol/[id]/topup` (x402 payment), query via `GET /api/protocol/[id]`, and `POST /api/protocol/webhook` for x402 confirmations remain available.

---

### 17b. Execution Guarantees (Phase 3)

Execution Guarantees provide **SLA-backed gas sponsorship** with budget reservation and refunds. Protocols create guarantees via `POST /api/v1/guarantees`; each guarantee has a **type** (GAS_BUDGET, TX_COUNT, or TIME_WINDOW), a **tier** (BRONZE / SILVER / GOLD), and a validity window. SILVER and GOLD charge a premium and define SLA targets (e.g. 95% within 5 min); on breach, a refund is calculated and can be auto-issued. The paymaster uses **sponsorTransactionWithGuarantee**: when an active guarantee exists for the agent and protocol, it validates capacity and gas constraints, executes with SLA tracking, records usage, and handles breaches (refunds). If no guarantee is found, execution falls back to normal sponsorship. Dashboard: main page shows a guarantees summary; `/dashboard/guarantees` lists all guarantees; `/dashboard/guarantees/[id]` shows detail and usage history and allows cancel.

---

### 17c. Internal CDP endpoints

**Internal-only** (for Aegis operations): `POST /api/internal/cdp/batch-submit` (submit protocol IDs to CDP allowlist) and `POST /api/internal/cdp/mark-approved` (mark protocols CDP-approved and transition to LIVE). Auth: **AEGIS_INTERNAL_API_KEY** (Bearer). Not for public or protocol use.

---

### 18. What is the Botchan webhook for and how is it secured?

**Purpose:** Receive sponsorship requests from other AI agents on Botchan network.

**Endpoint:** `POST /api/botchan/webhook`

**Security:**
- HMAC-SHA256 signature verification
- Header: `x-botchan-signature`
- Secret: `BOTCHAN_WEBHOOK_SECRET` env var
- In development: Allowed without secret (with warning)

**Payload:**
```json
{
  "type": "request",
  "feed": "aegis-requests",
  "sender": "0x...",
  "message": "Request sponsorship for 0xabc... on uniswap",
  "timestamp": 1706123456
}
```

---

### 18b. What is OpenClaw and how do I talk to Aegis via WhatsApp or TUI?

**OpenClaw** is a gateway that connects AI agents to messaging channels (WhatsApp, Telegram, Signal) and a local TUI. Operators can talk to Aegis in natural language; the OpenClaw agent uses the **Aegis skill** to call Aegis HTTP APIs and return results.

| Channel | How |
|--------|-----|
| **TUI** | Run `openclaw tui`; type e.g. "Check Aegis status", "Run a cycle", "Pause the agent" |
| **WhatsApp** | Link OpenClaw to WhatsApp in `~/.openclaw/openclaw.json`; send the same messages; only numbers in `channels.whatsapp.allowFrom` receive replies |
| **Direct API** | `POST /api/openclaw` with `{ command, sessionId, callbackUrl? }` (Bearer token); `GET /api/openclaw` returns the command manifest |

**Commands (via OpenClaw or POST /api/openclaw):** `status`, `cycle`, `sponsor`, `report`, `pause`, `resume`, `help`; Phase 2: `pause_timed`, `set_budget`, `analytics`, `block_wallet`, `set_gas_cap`, `topup`; `passport` — view wallet Gas Passport (trust score), e.g. "passport 0x...", "reputation", "my score".

**Setup:** Identity in `~/.openclaw/workspace/` (IDENTITY.md, SOUL.md, USER.md); Aegis skill in `~/.openclaw/workspace/skills/aegis/`; `AEGIS_URL` in workspace `.env`. See `docs/OPENCLAW_INTEGRATION.md` and `docs/OPENCLAW_WHATSAPP_OTHER_NUMBERS.md`.

---

## Data & Persistence

### 19. What is stored in the database?

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Agent** | Agent identity and config | onChainId, walletAddress, moltbookApiKey |
| **Observation** | Raw data snapshots | source, chainId, stateData (JSON) |
| **Decision** | LLM outputs | action, confidence, reasoning, policyErrors |
| **Execution** | Tx results | txHash, gasUsed, success, errorMessage |
| **Memory** | Learning data | type, content, embeddingId (Pinecone) |
| **PaymentRecord** | x402 payments | paymentHash, amount, status |
| **ReputationAttestation** | On-chain reputation | agentOnChainId, score, txHash |
| **ProtocolSponsor** | Protocol budgets, onboarding, guarantees | protocolId, balanceUSD, whitelistedContracts, onboardingStatus, policyConfig, apiKeyHash, totalGuaranteedUsd, guaranteeReserveUsd |
| **SponsorshipRecord** | Audit trail | userAddress, protocolId, decisionHash, estimatedCostUSD, actualCostUSD, txHash, ipfsCid |
| **DepositTransaction** | USDC deposits for protocols | protocolId, txHash, amount, confirmed |
| **ApprovedAgent** | Protocol-approved agent addresses | protocolId, agentAddress, maxDailyBudget |
| **OnboardingEvent** | Onboarding workflow events | protocolId, eventType, eventData |
| **PolicyOverride** | Per-protocol rule overrides (onboarding/config) | protocolId, ruleType (DAILY_BUDGET, GAS_PRICE_MAX, RATE_LIMIT), overrideValue, createdBy |
| **RuntimeOverride** | Time-bound/active overrides (OpenClaw) | protocolId, overrideType (PAUSE_UNTIL, MAX_GAS_PRICE_GWEI, etc.), value, expiresAt, isActive, createdBy |
| **BlockedWallet** | Blocked wallets per protocol | protocolId, walletAddress, reason, isActive |
| **Delegation**, **DelegationUsage** | Delegation and usage tracking | delegationId, protocolId, agentAddress, usage |
| **ExecutionGuarantee** | SLA-backed sponsorship reservation | type (GAS_BUDGET, TX_COUNT, TIME_WINDOW), beneficiary, protocolId, budget/used, lockedAmountUsd, premiumPaid, tier, status, validFrom/Until, usageRecords, breaches |
| **GuaranteeUsage** | Per-guarantee usage records | guaranteeId, userOpHash, txHash, gasUsed, costUsd, latencyMs, slaMet |
| **GuaranteeBreach** | SLA breach and refund tracking | guaranteeId, usageId, breachType, breachDetails, refundAmount, refundStatus |
| **GasPassportSnapshot** | Gas Passport V2 wallet reputation | walletAddress, sponsorshipCount, successRateBps, trustScore, tier (PassportTier), riskLevel, activity/behavior/risk metrics, external signals (ensName, farcasterFid, etc.), computedAt |

---

### 19b. Gas Passport V2

**Gas Passport V2** is a wallet reputation and trust-scoring system. For each wallet it computes: **activity metrics** (sponsorship count, success rate, protocol count, value); **behavioral metrics** (consistency, recency, burstiness); **risk metrics** (failure/rejection rates, flags); and optional **identity signals** (ENS, Farcaster, Basename, on-chain tx count). A **trust score** (0–1000) and a **tier** (NEWCOMER, ACTIVE, TRUSTED, PREMIUM, WHALE, FLAGGED) are derived from these. API: `GET /api/v1/passport?agent=0x...` (legacy) and `GET /api/v1/passport/[address]` with query params `format=full|summary|display`, `refresh`, `identity`. OpenClaw: use the `passport` command (e.g. "passport 0x...", "my score") to view a wallet's Gas Passport in chat. Data can be persisted in **GasPassportSnapshot**; the passport lib computes on demand from SponsorshipRecord and optional external APIs.

---

### 20. Where are "decisions" or sponsorship proofs stored?

| Storage | What's Stored | Why |
|---------|---------------|-----|
| **Database** | SponsorshipRecord (decision hash, cost, tx hash) | Fast queries, dashboard |
| **IPFS** | Full decision metadata JSON | Immutable, decentralized proof |
| **Farcaster** | Sponsorship proof cast (links to tx, decision, IPFS) | Public transparency |
| **Moltbook** | Activity summaries (aggregated stats) | Community engagement |
| **On-chain** | ActivityLogger events (decision hash, protocol, cost) | Verifiable audit trail |

---

### 21. How does the agent "remember" things?

**Dual Memory System:**

1. **Short-term (PostgreSQL via Prisma)**
   - Fast reads/writes
   - Structured queries
   - Recent decisions, observations, outcomes

2. **Long-term (Pinecone Vector DB)**
   - Semantic similarity search
   - OpenAI embeddings
   - Pattern recognition across history

**Memory Types:**
- `OBSERVATION` - Raw data snapshots
- `DECISION` - What was decided and why
- `OUTCOME` - What actually happened
- `LEARNED_PATTERN` - Extracted insights
- `USER_FEEDBACK` - External feedback

**Retrieval:** `retrieveRelevantMemories(observations)` finds semantically similar past experiences.

---

## Integrations & External Systems

### 22. How does Aegis use Moltbook?

**Moltbook** is a social network for AI agents. Aegis uses it for:

| Feature | Implementation |
|---------|----------------|
| **Agent Profile** | Registered via `scripts/register-moltbook.ts` |
| **Heartbeat Posts** | Every 30 min: sponsorship activity summaries |
| **Feed Reading** | Monitor DeFi/gas discussions |
| **Upvoting** | Engage with relevant posts |
| **Comments/Replies** | Answer questions via Conversationalist skill |
| **Agent Discovery** | Find other agents for collaboration |

**API:** `https://www.moltbook.com/api/v1`
**Rate Limits:** 1 post per 30 min, 1 comment per 20 sec

---

### 23. What role does Farcaster play?

**Farcaster** is used for public transparency and proof posting:

| Use Case | Implementation |
|----------|----------------|
| **Sponsorship Proofs** | Cast after each successful sponsorship |
| **Daily Stats** | Aggregate stats cast |
| **Health Updates** | Periodic agent health posts |
| **Emergency Alerts** | When emergency mode activates |

**Proof Cast Format:**
```
Sponsored execution for agent 0xabc...
Protocol: uniswap-v3
Cost: $0.52
Gas saved: ~200k units
Reasoning: User has 30 days history, DeFi active
View TX: https://basescan.org/tx/0x...
Decision: 0x1234...
#BasePaymaster #AutonomousAgent
```

**SDK:** Neynar (`NEYNAR_API_KEY`, `FARCASTER_SIGNER_UUID`)

---

### 24. What is Botchan in this project?

**Botchan** is an on-chain agent messaging protocol on Base:

| Direction | Feed | Purpose |
|-----------|------|---------|
| **Inbound** | `aegis-requests` | Receive sponsorship requests from other agents |
| **Outbound** | `aegis-sponsorships` | Post sponsorship summaries |
| **Outbound** | `aegis-reserves` | Post reserve swap events |

**How it works:**
1. Other agents post requests to `aegis-requests`
2. Aegis polls feed via `observeBotchanRequests()`
3. Botchan Listener skill processes requests
4. Aegis posts results to `aegis-sponsorships`

**CLI:** Uses `botchan` CLI tool with `BOTCHAN_PRIVATE_KEY`

---

### 25. What is ERC-8004 used for?

**ERC-8004** is a standard for AI agent identity and reputation on-chain:

| Component | Purpose | Contract |
|-----------|---------|----------|
| **Identity Registry** | Register agent with metadata | `ERC8004_IDENTITY_REGISTRY_ADDRESS` |
| **Reputation Registry** | Track agent quality scores | `ERC8004_REPUTATION_REGISTRY_ADDRESS` |

**Registration Process:**
1. Build metadata (name, description, capabilities, endpoints)
2. Upload to IPFS
3. Call `register()` on Identity Registry
4. Get `agentId` (on-chain ID)

**Reputation:**
- `giveFeedback()` - Clients rate agent performance
- `getSummary()` - Aggregate reputation score
- Aegis uses this to attest sponsored agents

---

### 26. How does the agent actually send transactions?

**Transaction Path:**

```
Decision Approved
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  1. Sign decision with agent wallet (ECDSA)              │
│  2. Compute decision hash (keccak256)                    │
│  3. For SPONSOR_TRANSACTION:                             │
│     a. Build UserOperation                               │
│     b. Sign paymaster approval                           │
│     c. Submit to Pimlico bundler (BUNDLER_RPC_URL)       │
│     d. Bundler submits to EntryPoint contract            │
│  4. For other actions:                                   │
│     a. Use CDP AgentKit for direct tx                    │
│     b. Submit via RPC_URL_BASE                           │
│  5. Log to AegisActivityLogger contract                  │
│  6. Wait for confirmation                                │
└──────────────────────────────────────────────────────────┘
```

**Networks:**
- Mainnet: Base (chain ID 8453)
- Testnet: Base Sepolia (chain ID 84532)

---

## Security, Config & Ops

### 27. Which env vars are required to run and test the agent?

**CRITICAL (Required):**
```env
DATABASE_URL=postgresql://...
RPC_URL_BASE=https://...
OPENAI_API_KEY=sk-...  # or ANTHROPIC_API_KEY
KEYSTORE_ACCOUNT=...
KEYSTORE_PASSWORD=...
AEGIS_API_KEY=...
```

**HIGH (Production):**
```env
BUNDLER_RPC_URL=https://api.pimlico.io/...
ACTIVITY_LOGGER_ADDRESS=0x...
CDP_API_KEY_NAME=...
CDP_API_KEY_PRIVATE_KEY=...
```

**MEDIUM (Features):**
```env
NEYNAR_API_KEY=...          # Farcaster
MOLTBOOK_API_KEY=...        # Moltbook
PINECONE_API_KEY=...        # Vector memory
REACTIVE_CALLBACK_SECRET=... # Reactive Network
```

**LOW (Optional):**
```env
REDIS_URL=...               # Persistent state
SLACK_WEBHOOK_URL=...       # Alerts
SENTRY_DSN=...              # Error tracking
```

---

### 28. How is the cycle API protected?

**Authentication:** Bearer token via `Authorization` header

```bash
curl -X POST http://localhost:3000/api/agent/cycle \
  -H "Authorization: Bearer YOUR_AEGIS_API_KEY" \
  -H "Content-Type: application/json"
```

**Who should have it:**
- Operators running the agent
- Monitoring systems
- NOT end users or protocols

**Implementation:** `src/lib/auth/api-auth.ts` uses timing-safe comparison.

**Other auth:** v1 protocol routes (`/api/v1/protocol/[id]/onboarding-status`, `/api/v1/protocol/[id]/policy`) use the protocol's **API key** (Bearer). Internal CDP routes use **AEGIS_INTERNAL_API_KEY** (Bearer).

---

### 29. What happens if the database is down?

| Component | Behavior |
|-----------|----------|
| **Observations** | Blockchain/oracle observations continue (no DB needed) |
| **Protocol Budgets** | Cannot read budgets → sponsorship fails policy |
| **Decision Storage** | Fails gracefully with warning log |
| **Memory Retrieval** | Returns empty → LLM reasons without context |
| **Dashboard** | Returns errors, no data displayed |
| **Circuit Breaker** | Falls back to in-memory state (loses persistence) |

**No data loss:** Agent logs decisions to console even if DB fails.

---

### 30. How do we deploy or run the agent in production?

**Recommended Setup:**

1. **Database:** PostgreSQL (managed, e.g., Neon, Supabase)
2. **Redis:** Optional but recommended for state persistence
3. **Secrets:** Use environment variables or secret manager

**Run Commands:**
```bash
# Development
npm run dev              # Next.js app only
npm run agent:start      # Full agent (tsx scripts/run-agent.ts; reserve + sponsorship + heartbeat + queue)

# Production
npm run build
npm run start            # Next.js production
npm run agent:start      # Or: tsx scripts/run-agent.ts (or node after compiling)
```

**Deployment:**
- Docker container or Node.js process manager (PM2)
- Health check: `GET /api/health`
- Logs: Structured JSON via `src/lib/logger.ts`

---

## Skills & Extensibility

### 31. What are "skills" in Aegis?

**Skills** are modular capabilities that extend the agent beyond core sponsorship:

```typescript
interface Skill {
  name: string;
  description: string;
  trigger: 'schedule' | 'event' | 'request';
  interval?: number;       // For scheduled skills
  events?: SkillEvent[];   // For event-driven skills
  enabled: boolean;
  execute: (context) => Promise<SkillResult>;
}
```

**Trigger Types:**
| Type | When It Runs | Example |
|------|--------------|---------|
| `schedule` | Periodic interval | Agent Discovery (hourly) |
| `event` | After specific events | Reputation Attestor (after sponsorship) |
| `request` | External trigger | Botchan Listener (webhook) |

---

### 32. Which skills are built in and what does each do?

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **Moltbook Conversationalist** | Schedule (30 min) | Reply to comments on Aegis posts, answer gas sponsorship questions |
| **Botchan Listener** | Schedule (60 sec) | Process incoming sponsorship requests from other agents |
| **Agent Discovery** | Schedule (4 hours) | Find and catalog AI agents on Moltbook for collaboration |
| **Reputation Attestor** | Event (sponsorship:success) | Issue ERC-8004 attestations for sponsored agents |
| **Reputation Attestor Batch** | Schedule (6 hours) | Batch process unattested sponsorships |

---

### 33. When do scheduled skills run?

**During `runFullHeartbeat()`** (invoked every 15 minutes by MultiModeAgent):
1. Run Moltbook heartbeat (feed check, post activity summary if 30 min elapsed, upvote relevant posts)
2. Run all scheduled skills that are due (each skill has its own interval)

**Skill intervals:**
- Moltbook Conversationalist: 30 min
- Botchan Listener: 60 sec
- Queue consumer: 30 sec (also has dedicated timer in MultiModeAgent)
- Agent Discovery: 4 hours
- Reputation Attestor Batch: 6 hours

---

### 34. When do event-driven skills run?

**Events emitted by the agent:**
- `sponsorship:success` - After successful SPONSOR_TRANSACTION
- `sponsorship:failed` - After failed sponsorship
- `heartbeat:start` / `heartbeat:end` - Heartbeat lifecycle
- `cycle:start` / `cycle:end` - Agent cycle lifecycle

**Example:** Reputation Attestor listens to `sponsorship:success`:
```typescript
// In multi-mode-agent.ts after successful sponsorship:
executeEventSkills('sponsorship:success', {
  userAddress: params.agentWallet,
  protocolId: params.protocolId,
  txHash: result.sponsorshipHash,
});
```

---

### 35. Agent Skills (policy domain knowledge) and hybrid executor

**Agent Skills** (in `src/lib/skills/`) are SKILL.md modules used to improve sponsorship decisions with structured domain knowledge (gas estimation, protocol vetting, agent reputation, SLA, breach detection). They are separate from the scheduled/event “skills” above.

**Hybrid execution flow:**

1. **Deterministic guards** run first per skill (e.g. gas price > 200 gwei or cost > $100 → REJECT; passport tier FLAGGED → ESCALATE).
2. If no guard fires, **LLM evaluation** runs when `SKILLS_ENFORCED=true` and an API key is set: skill content + context are sent to the configured model; the response is parsed as `{ decision, confidence, reasoning, warnings }`.
3. If parsing or the LLM fails and **fail-closed** is on, the executor returns REJECT so sponsorship is blocked.

**Enforced mode:** When `SKILLS_ENFORCED=true`, the policy engine calls the skills chain for every `SPONSOR_TRANSACTION`. If the skill verdict is REJECT or ESCALATE, policy fails (same as a rule error). Applied skills and reasoning are recorded in policy errors/warnings for auditability.

**Environment and behavior:**

| Env | Purpose | Default |
|-----|---------|--------|
| `SKILLS_ENFORCED` | When `true`, skill verdict is enforced for sponsorship | `false` |
| `SKILLS_FAIL_CLOSED` | When `true`, LLM/parse failure yields REJECT | `true` |
| `SKILLS_LLM_MODEL` | Provider and model, e.g. `openai:gpt-4o-mini` or `anthropic:claude-sonnet-4-20250514` | `openai:gpt-4o-mini` |
| `SKILLS_GAS_REJECT_GWEI` | Gas price (gwei) above which gas-estimation guard rejects | `200` |
| `SKILLS_COST_REJECT_USD` | Estimated cost (USD) above which gas-estimation guard rejects | `100` |

**Metrics:** `aegis_skills_enforced_reject_total` (rejections due to skills), `aegis_skills_parse_fail_total` (parse/LLM failures when fail-closed).

---

## Contracts & Chain

### 35. What smart contracts does Aegis use or deploy?

| Contract | Purpose | Deployed By |
|----------|---------|-------------|
| **AegisActivityLogger** | On-chain audit trail of decisions | `npm run deploy:activity-logger` |
| **AegisReactiveObserver** | Subscribe to Reactive Network events | `npm run deploy:reactive-observer` |
| **Identity Registry** | ERC-8004 agent registration | External (standard) |
| **Reputation Registry** | ERC-8004 reputation tracking | External (standard) |
| **EntryPoint v0.7** | ERC-4337 account abstraction | External (standard) |
| **USDC** | Payment token | External (Circle) |

**ActivityLogger Events:**
- `Sponsorship(user, protocolId, decisionHash, cost, timestamp, metadata)`
- `ReserveSwap(tokenIn, tokenOut, amountIn, amountOut, decisionHash)`
- `ProtocolAlert(protocolId, alertType, decisionHash, timestamp)`

---

### 36. Which chains are supported?

| Chain | Chain ID | Purpose | RPC Env Var |
|-------|----------|---------|-------------|
| Base | 8453 | Production | `RPC_URL_BASE` |
| Base Sepolia | 84532 | Testing | `RPC_URL_BASE_SEPOLIA` |
| Ethereum Mainnet | 1 | Oracles, ERC-8004 | `RPC_URL_ETHEREUM` |
| Sepolia | 11155111 | ERC-8004 testing | `RPC_URL_SEPOLIA` |

**Default:** Base Sepolia (`SUPPORTED_CHAINS=84532`)

---

### 37. How does the agent know "protocol budgets" and spending?

**Database-driven:**
1. Protocol registers via `/api/protocol/register`
2. Budget stored in `ProtocolSponsor.balanceUSD`
3. Each sponsorship deducts from balance
4. Top-ups via `/api/protocol/[id]/topup`

**Policy enforcement:**
- `protocol-budget-check` rule verifies budget > 0
- `sponsorship-cost-cap` ensures cost < $0.50

**Observation:**
```typescript
// In observeProtocolBudgets()
const protocols = await db.protocolSponsor.findMany({
  where: { balanceUSD: { gt: 0 } }
});
```

---

## Agent-to-Agent Interactions

### 38. How can other agents or operators interact with Aegis?

**For other AI agents (sponsorship requests):**

1. **Botchan Feed** (Recommended)
   - Post to `aegis-requests` feed
   - Format: "Request sponsorship for 0x... on [protocol]"
   - Aegis polls and responds

2. **Botchan Webhook**
   - Direct HTTP POST to `/api/botchan/webhook`
   - Faster response, requires webhook secret

3. **Moltbook Mention**
   - Mention @Aegis in a Moltbook post
   - Conversationalist skill may respond

**For humans / operators (monitoring and control):**

4. **OpenClaw (WhatsApp, Telegram, TUI)**
   - Talk to Aegis in natural language via OpenClaw gateway
   - Commands: status, cycle, report, pause, resume, sponsor, analytics, set budget, block wallet, passport (trust score), etc.
   - Aegis skill calls `POST /api/openclaw`; optional proactive push via callback URL
   - See `docs/OPENCLAW_INTEGRATION.md` for setup

---

### 39. How does Aegis discover and profile other agents?

**Agent Discovery Skill:**
1. Searches Moltbook for keywords: defi, gas, paymaster, sponsorship, base
2. Extracts agent profiles (name, description, karma, followers)
3. Calculates relevance score
4. Stores in state (top 200 agents)
5. Auto-follows high-relevance agents (score >= 15)

**Categories assigned:** defi, nft, social, gas-optimization, yield, security, data

---

### 40. How does Aegis build trust with other agents?

**Reputation System:**

1. **Outbound:** Issues ERC-8004 attestations for agents it sponsors
   - Score: 85 (high quality)
   - Includes: protocolId, txHash, timestamp

2. **Inbound:** Other agents can call `giveFeedback()` on Aegis
   - Aegis's reputation tracked in Reputation Registry
   - Visible via `getSummary()`

3. **Discovery:** Tracks karma and follower counts from Moltbook
   - High-karma agents get priority sponsorship

---

### 41. Can Aegis collaborate with other autonomous agents?

**Current capabilities:**
- **Receive requests** via Botchan/Moltbook
- **Respond** with sponsorship decisions
- **Attest** other agents' quality
- **Discover** and profile agents
- **Engage** in discussions

**Future potential:**
- A2A negotiation (negotiate rates with protocol agents)
- Multi-agent workflows (chain of agents)
- Shared memory/context

---

### 42. How does Aegis communicate its activities publicly?

| Channel | Content | Frequency |
|---------|---------|-----------|
| **Farcaster** | Individual sponsorship proofs | After each sponsorship |
| **Moltbook** | Aggregated activity summaries | Every 30 min |
| **Botchan** | Sponsorship confirmations | After each sponsorship |
| **On-chain** | ActivityLogger events | Every decision |
| **IPFS** | Full decision metadata | Every decision |

---

## Complete Capabilities Reference

### All Actions the Agent Can Take

| Action | Mode | Description |
|--------|------|-------------|
| `SPONSOR_TRANSACTION` | Gas Sponsorship | Pay gas for user's next tx |
| `SWAP_RESERVES` | Gas Sponsorship | Convert USDC→ETH for reserves |
| `ALERT_PROTOCOL` | Gas Sponsorship | Notify protocol of low budget |
| `WAIT` | Both | Do nothing this cycle |
| `ALERT_HUMAN` | Both | Send alert to operator |
| `REPLENISH_RESERVES` | Reserve Pipeline | Convert USDC→ETH when low |
| `ALLOCATE_BUDGET` | Reserve Pipeline | Assign x402 payment to protocol |
| `ALERT_LOW_RUNWAY` | Reserve Pipeline | Alert when runway < 7 days |
| `REBALANCE_RESERVES` | Reserve Pipeline | Maintain 70/30 ETH/USDC ratio |

---

### All Observations the Agent Gathers

| Category | Data Points |
|----------|-------------|
| **Blockchain** | Block number, gas price, balances, contract state |
| **Wallets** | Low-gas wallets, failed txs, new activations, tx history |
| **Prices** | ETH/USD, BTC/USD from Chainlink/CoinGecko |
| **Protocols** | Budgets, spending, whitelisted contracts |
| **Reserves** | ETH balance, USDC balance, burn rate, runway |
| **Social** | Botchan requests, Moltbook discussions |

---

### All Policy Rules

**Sponsorship (SPONSOR_TRANSACTION):** protocol-onboarding-status, runtime-pause-check, runtime-blocked-wallet-check, user-legitimacy-check (5+ txs or Gas Passport), approved-agent-check, protocol-budget-check, agent-reserve-check (0.1 ETH), daily-cap-per-user (3/day), global-rate-limit (10/min), per-protocol-rate-limit (5/min), per-sponsorship-cost-cap ($0.50), contract-whitelist-check, gas-price-optimization (max Gwei: runtime override &gt; config &gt; env).

**Reserve pipeline:** min-usdc-buffer (&gt; 20%), max-replenish-amount (&lt; $500), emergency-halt.

| Rule (summary) | Severity | Threshold |
|---------------|----------|-----------|
| User legitimacy | ERROR | 5+ historical txs (or Gas Passport preferential) |
| Protocol onboarding | ERROR | Protocol in LIVE/simulation, not paused |
| Protocol budget | ERROR | > 0 USD (and ≥ estimated cost) |
| Agent reserves | ERROR | > 0.1 ETH |
| Daily cap per user | ERROR | 3 sponsorships |
| Global rate limit | ERROR | 10/minute |
| Per-protocol rate | ERROR | 5/minute |
| Sponsorship cost | ERROR | < $0.50 |
| Gas price | ERROR | Max Gwei from runtime override &gt; config &gt; env (default e.g. 2 Gwei) |
| USDC buffer (reserve) | ERROR | > 20% |
| Max replenish (reserve) | ERROR | < $500 |
| Emergency halt | ERROR | Block if active |

---

### All External Integrations

| System | Purpose | Config |
|--------|---------|--------|
| **Pimlico** | UserOperation bundling | `BUNDLER_RPC_URL` |
| **Chainlink** | Price oracles | Built-in addresses |
| **CoinGecko** | Price fallback | `COINGECKO_API_KEY` |
| **Blockscout** | Wallet/tx data | `BLOCKSCOUT_API_URL` |
| **OpenAI** | LLM reasoning | `OPENAI_API_KEY` |
| **Anthropic** | LLM reasoning (alt) | `ANTHROPIC_API_KEY` |
| **Pinecone** | Vector memory | `PINECONE_API_KEY` |
| **IPFS** | Decision storage | `IPFS_*` vars |
| **Farcaster** | Social proofs | `NEYNAR_API_KEY` |
| **Moltbook** | Agent social | `MOLTBOOK_API_KEY` |
| **Botchan** | Agent messaging | `BOTCHAN_PRIVATE_KEY` |
| **OpenClaw** | Operator chat (WhatsApp, Telegram, TUI) | `AEGIS_URL` in OpenClaw workspace |
| **Reactive** | Event webhooks | `REACTIVE_CALLBACK_SECRET` |
| **Slack** | Alerts | `SLACK_WEBHOOK_URL` |
| **Redis** | State persistence | `REDIS_URL` |

---

### All Skills and Triggers

| Skill | Trigger | Interval/Event |
|-------|---------|----------------|
| Moltbook Conversationalist | schedule | 30 min |
| Botchan Listener | schedule | 60 sec |
| Queue consumer | schedule | 30 sec |
| Agent Discovery | schedule | 4 hours |
| Reputation Attestor | event | sponsorship:success |
| Reputation Attestor Batch | schedule | 6 hours |

---

## Maximizing the Agent

### Best Practices

1. **Run in LIVE mode** for actual sponsorships
2. **Configure all social integrations** for maximum visibility
3. **Register on ERC-8004** for discoverability
4. **Monitor dashboard** for health and activity
5. **Set up alerts** via Slack for critical issues
6. **Use Redis** for persistent state across restarts
7. **Register protocols** to start sponsoring

### Performance Tuning

| Setting | Aggressive | Conservative |
|---------|------------|--------------|
| Confidence threshold | 0.7 | 0.9 |
| Gas price max | 5 Gwei | 1 Gwei |
| Max sponsorship cost | $1.00 | $0.25 |
| Rate limit (global) | 20/min | 5/min |
| Rate limit (per user) | 5/day | 2/day |

### Monitoring

- **Dashboard:** Real-time stats at `/dashboard`
- **Logs:** `LOG_LEVEL=debug` for verbose output
- **Sentry:** `SENTRY_DSN` for error tracking
- **Health:** `GET /api/health` for uptime monitoring

---

*This documentation covers everything the Aegis Agent can do. For updates, check the codebase or run `npm run docs`.*
