# Aegis Agent — Workflows & Comprehensive Overview

This document is a **robust rundown of every workflow** in the Aegis codebase and **comprehensive context** so another person can understand, run, and build the agent. **Section 11** contains practical Q&A for deeper operational understanding (when the agent skips, how it decides, security boundaries, failure modes).

---

## 1. What Aegis Is

**Aegis** is an **AI-powered autonomous treasury management agent** that:

- **Observes** blockchain state (balances, gas, prices, treasury, governance, DeFi positions)
- **Reasons** with an LLM (OpenAI GPT-4 or Anthropic Claude) to propose structured actions
- **Validates** every decision through a **policy engine** (confidence, value limits, gas, rate limits, whitelists)
- **Executes** via **Coinbase AgentKit** (TRANSFER, SWAP, REBALANCE) or viem (EXECUTE for contract calls)
- **Stores** observations, decisions, and outcomes in **PostgreSQL + Pinecone** for long-term memory and retrieval
- **Integrates** with **x402** (pay-per-action), **Reactive Network** (event-driven triggers), **Moltbook** (social/heartbeat), and **ERC-8004** (on-chain identity/reputation)

The core loop is: **Observe → Retrieve memories → Reason → Validate policy → Execute (if approved) → Store memory**.

---

## 2. Workflow Rundown

### 2.1 Main Agent Cycle (Observe–Reason–Decide–Act–Memory)

**Entry:** `runAgentCycle(config)` in `src/lib/agent/index.ts`, or `startAgent(config, intervalMs)` for continuous polling.

**Steps:**

1. **Observe**  
   - `observe()` in `src/lib/agent/observe/index.ts`:
     - `observeBlockchainState()` — block number, gas price per supported chain (viem, `SUPPORTED_CHAINS`)
     - If `TREASURY_ADDRESS` set: `observeTreasury()` — token balances, DeFi positions, governance, risk metrics
     - `observeOraclePrices(['ETH/USD'])` — Chainlink then CoinGecko, cached (LRU)
   - Returns array of `Observation` (id, timestamp, source, chainId, blockNumber, data, context).

2. **Retrieve memories**  
   - `retrieveRelevantMemories(observations, limit)`:
     - Embed current observations (OpenAI `text-embedding-3-small`)
     - Query Pinecone for similar vectors, then load full records from PostgreSQL via `MemoryStore.findByIds()`.

3. **Reason**  
   - `reason(observations, memories)` in `src/lib/agent/reason/`:
     - Builds context (observations, memories, constraints); masks sensitive data.
     - If `USE_CLAUDE_REASONING=true`: Claude with JSON-in-response parsing.
     - Else: OpenAI with tool call `make_decision` (action, confidence, reasoning, parameters).
     - Validates output with `DecisionSchema` (Zod). Actions: EXECUTE, WAIT, ALERT_HUMAN, REBALANCE, SWAP, TRANSFER.
     - On error returns safe default: `{ action: 'WAIT', confidence: 0, reasoning: '...' }`.

4. **Validate policy**  
   - `validatePolicy(decision, config)` in `src/lib/agent/policy/`:
     - Runs all built-in rules (see Policy rules below). Any **ERROR** → `passed: false`, cycle stops and memory stores “POLICY_REJECTED”.
     - Rules: confidence-threshold, readonly-mode, reasoning-required, parameters-required, transaction-value-limit, high-value-alert, gas-price-limit, rate-limiter, address-whitelist, slippage-protection.
     - Rate limiter and circuit breaker state: in-memory or Redis when `REDIS_URL` is set.

5. **Execute**  
   - If policy passed and `decision.confidence >= config.confidenceThreshold`:
     - READONLY: skip execution.
     - SIMULATION: `simulateExecution(decision)` in `agentkit.ts` (viem `simulateContract` / `estimateContractGas` for TRANSFER/EXECUTE transfer/approve).
     - LIVE: `getDefaultCircuitBreaker().execute(() => executeWithAgentKit(decision, 'LIVE'))` — AgentKit for TRANSFER/SWAP/REBALANCE; viem + `EXECUTE_WALLET_PRIVATE_KEY` for EXECUTE (contract allowlist `ALLOWED_CONTRACT_ADDRESSES`).
   - ALERT_HUMAN: `sendAlert()` — Slack (`SLACK_WEBHOOK_URL`) and/or generic webhook (`ALERT_WEBHOOK_URL`), with dedup and retry.

6. **Store memory**  
   - `storeMemory({ type: 'DECISION', observations, decision, outcome })`:
     - Embed content (OpenAI), upsert to Pinecone, create record in PostgreSQL (Prisma `Memory` + optional `Agent`).

**Output:** `AgentState` (observations, memories, currentDecision, executionResult).

---

### 2.2 API Workflows

#### POST `/api/agent/cycle` (manual cycle trigger)

- **Auth:** Bearer token = `AEGIS_API_KEY` (`verifyApiAuth`).
- **Body:** Optional JSON parsed with `AgentCycleRequestSchema`: `confidenceThreshold`, `maxTransactionValueUsd`, `executionMode` (only `SIMULATION` | `READONLY`; LIVE not allowed from API).
- **Flow:** `runAgentCycle(parsed)` → JSON response with `ok`, `state` (observationsCount, currentDecision, hasExecutionResult).
- **Files:** `app/api/agent/cycle/route.ts`, `src/lib/api/schemas.ts`, `src/lib/auth/api-auth.ts`.

#### GET `/api/agent/status` (health)

- **Auth:** Same Bearer `AEGIS_API_KEY`.
- **Response:** `{ status: 'healthy', timestamp, uptime }`.
- **File:** `app/api/agent/status/route.ts`.

#### GET `/api/agent/price` (x402 pricing; no auth)

- **Query:** `action`, `token`, `amount` (defaults: TRANSFER, USDC, 0).
- **Flow:** Uses `getPrice('ETH/USD')` and gas estimate per action type; applies `X402_BASE_FEE_USDC`, `X402_GAS_MARKUP`, action multipliers.
- **Response:** `price`, `priceWei`, `currency`, `validFor`, `action`, `breakdown`.
- **File:** `app/api/agent/price/route.ts`.

#### POST `/api/reactive/event` (Reactive Network webhook)

- **Auth:** Bearer `AEGIS_API_KEY` + HMAC signature: header `x-reactive-signature` = HMAC-SHA256(body, `REACTIVE_CALLBACK_SECRET`). If `REACTIVE_CALLBACK_SECRET` is unset, request is denied.
- **Body:** `ReactiveEventSchema`: `chainId`, `event`, `data`.
- **Flow:** Verify signature → `runAgentCycle({ ..., triggerSource: 'reactive', eventData: { chainId, event, data } })` → `{ ok: true, triggered: true }`.
- **File:** `app/api/reactive/event/route.ts`.

---

### 2.3 x402 Payment Workflow

- **Verify:** `verifyX402Payment(proof)` in `src/lib/agent/payments/x402.ts`:
  - Requires `X402_FACILITATOR_URL` (and optionally `X402_API_KEY`). POST to facilitator `/verify`; throws if unverified.
- **Execute paid action:** `executePaidAction(paymentProof, agentOnChainId?)`:
  - Idempotency: if `PaymentRecord` for `paymentHash` is already EXECUTED, return previous result.
  - Verify payment → upsert record CONFIRMED → `runAgentCycle(...)` with `X402_EXECUTION_MODE` → upsert EXECUTED/PENDING; if `agentOnChainId` and execution result, call `recordExecution()` for reputation attestation.
- **Middleware:** `parseX402Headers(request)` / `requirePayment(request, requiredAmount?, currency?)` in `x402-middleware.ts` (X-PAYWITH-402, PAYMENT-SIGNATURE; JSON or Base64).

---

### 2.4 Reactive Network Workflow (on-chain → webhook)

- **On-chain:** Contract `AegisReactiveObserver.sol` (Foundry). Owner subscribes to (chainId, target, eventName). Reactive runtime calls `react(chainId, eventName, eventData)` which emits `Reacted`.
- **Off-chain:** Indexer / Reactive Network sends POST to your `/api/reactive/event` with HMAC. Aegis runs one agent cycle with `eventData` in context.

---

### 2.5 Moltbook Workflow

- **Registration (one-time):** `npm run register:moltbook` → `scripts/register-moltbook.ts` → `registerMoltbookAgent(name, description)` (no API key). User gets `api_key`, `claim_url`; after X verification, set `MOLTBOOK_API_KEY` in `.env`.
- **Heartbeat:** `runMoltbookHeartbeat()` in `src/lib/agent/social/heartbeat.ts`:
  - Guard: `MOLTBOOK_API_KEY` and interval (`MOLTBOOK_HEARTBEAT_INTERVAL`, default 4h) via `getStateStore().get('lastMoltbookCheck')`.
  - Fetch feed, optionally post treasury insight (from `observe()`), upvote relevant DeFi/crypto posts, update last check timestamp.
- **State:** Redis or in-memory (`getStateStore()`).

---

### 2.6 ERC-8004 Identity & Reputation Workflow

- **Register identity:** `registerAgentIdentity(agentId, agentName, capabilities, metadataUri?)` in `src/lib/agent/identity/erc8004.ts`: upload metadata to IPFS (or data URI if no `IPFS_GATEWAY_URL`), mint via registry at `ERC8004_IDENTITY_REGISTRY_ADDRESS` (or mock), update Prisma `Agent.onChainId` / `walletAddress`.
- **Reputation:** After paid execution, `recordExecution()` in `src/lib/agent/identity/reputation.ts`: `calculateQualityScore(execution)`, `submitReputationAttestation()` — Prisma `ReputationAttestation`; if `REPUTATION_ATTESTATION_CONTRACT_ADDRESS` and wallet set, attest on-chain.

---

### 2.7 Continuous Agent (polling)

- **Entry:** `startAgent(config, intervalMs)` in `src/lib/agent/index.ts`.
- **Flow:** Run one cycle immediately, then `setInterval(runCycle, intervalMs)`. On SIGTERM/SIGINT: set draining, clear timer, exit.
- **Run:** `npm run agent:dev` (tsx watch) or `npm run agent:run` (single run).

---

### 2.8 OpenClaw workflow (operator chat: WhatsApp, Telegram, TUI)

- **Purpose:** Let operators and business owners talk to Aegis in natural language via OpenClaw (TUI, WhatsApp, Telegram, Signal) instead of using the dashboard or API directly.
- **Flow:** User sends a message (e.g. "Check Aegis status") → OpenClaw gateway routes to Claude agent → Aegis skill calls `GET /api/health` or `POST /api/openclaw` with `{ command, sessionId, callbackUrl? }` → Aegis returns JSON → OpenClaw formats and replies to the user.
- **Auth:** `POST /api/openclaw` uses Bearer token (`AEGIS_API_KEY`); in development, unset key is allowed.
- **Commands:** `status`, `cycle`, `sponsor`, `report`, `pause`, `resume`, `help`; Phase 2: `pause_timed`, `set_budget`, `analytics`, `block_wallet`, `set_gas_cap`, `topup`. Proactive notifications: when `callbackUrl` is set, Aegis can push sponsorship summaries and alerts back through OpenClaw.
- **Files:** `app/api/openclaw/route.ts`, `src/lib/agent/openclaw/command-handler.ts`, `src/lib/agent/openclaw/proactive-reporter.ts`, `src/lib/agent/openclaw/analytics.ts`.
- **Docs:** `docs/OPENCLAW_INTEGRATION.md`, `docs/OPENCLAW_WHATSAPP_OTHER_NUMBERS.md`.

---

## 3. Architecture & Modules

| Layer        | Path                     | Responsibility |
|-------------|---------------------------|----------------|
| Orchestrator| `src/lib/agent/index.ts`  | `runAgentCycle`, `startAgent`, config, state shape |
| Observe     | `src/lib/agent/observe/`  | Blockchain (viem), treasury, oracles (Chainlink/CoinGecko), defi, governance |
| Reason      | `src/lib/agent/reason/`   | Prompts, OpenAI/Claude, DecisionSchema (Zod) |
| Policy      | `src/lib/agent/policy/`   | Rules (confidence, value, gas, rate limit, whitelist, slippage) |
| Execute     | `src/lib/agent/execute/`  | AgentKit (transfer, swap, rebalance), viem EXECUTE, simulation, alerts, circuit breaker |
| Memory      | `src/lib/agent/memory/`   | Store (Prisma), embeddings (OpenAI + Pinecone), retrieve |
| Payments    | `src/lib/agent/payments/` | x402 verify, execute paid action, middleware |
| Identity    | `src/lib/agent/identity/` | ERC-8004 mint, IPFS metadata, reputation attestation |
| Social      | `src/lib/agent/social/`   | Moltbook API, heartbeat |
| OpenClaw    | `src/lib/agent/openclaw/` | Command handler, proactive reporter, analytics; `POST/GET /api/openclaw` |
| State store | `src/lib/agent/state-store.ts` | Redis or in-memory key/value for rate limiter, circuit breaker, Moltbook last check |

**Chains:** `src/lib/agent/observe/chains.ts` — `SUPPORTED_CHAINS` (comma-separated chain IDs), default 84532 (baseSepolia). RPC URLs: `RPC_URL_BASE`, `RPC_URL_BASE_SEPOLIA`, `RPC_URL_ETHEREUM`, `RPC_URL_SEPOLIA` (and env keys used in code for baseSepolia: `RPC_URL_BASE_SEPOLIA` or `RPC_URL_84532`).

**AgentKit:** `CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY` (in code also `CDP_API_KEY_PRIVATE_KEY`; `.env` uses `CDP_API_KEY_PRIVATE_KEY`). Network: `AGENT_NETWORK_ID` (e.g. base-sepolia).

---

## 4. Environment Variables (Reference)

Copy from `.env` and fill. **Required** for full functionality:

- **Database:** `DATABASE_URL` (PostgreSQL; required for memory/identity/Prisma).
- **API auth:** `AEGIS_API_KEY` (Bearer for `/api/agent/cycle`, `/api/agent/status`, `/api/reactive/event`).
- **Reactive webhook:** `REACTIVE_CALLBACK_SECRET` (HMAC secret; if unset, reactive webhook denies all).
- **x402:** `X402_FACILITATOR_URL` (required to accept verified payments); optional: `X402_API_KEY`, `X402_ENABLED`, `X402_MIN_PAYMENT_USD`, `X402_EXECUTION_MODE`, `X402_BASE_FEE_USDC`, `X402_GAS_MARKUP`.

**AI / Memory:**

- `OPENAI_API_KEY` (reasoning + embeddings).
- `USE_CLAUDE_REASONING` (optional), `ANTHROPIC_API_KEY`, `OPENAI_REASONING_MODEL`, `ANTHROPIC_REASONING_MODEL`.
- `PINECONE_API_KEY`, `PINECONE_ENVIRONMENT`, `PINECONE_INDEX_NAME` (vector store).

**Blockchain:**

- `RPC_URL_BASE`, `RPC_URL_BASE_SEPOLIA`, `RPC_URL_ETHEREUM`, `RPC_URL_SEPOLIA` (and `RPC_URL_84532` where used).
- `SUPPORTED_CHAINS` (e.g. `84532,8453`), `AGENT_NETWORK_ID` (e.g. base-sepolia).

**CDP / AgentKit:**

- `CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY` (and in code `CDP_API_KEY_PRIVATE_KEY`).

**Agent config:**

- `AGENT_CONFIDENCE_THRESHOLD`, `MAX_TRANSACTION_VALUE_USD`, `MAX_GAS_PRICE_GWEI`, `AGENT_EXECUTION_MODE` (LIVE | SIMULATION | READONLY).
- Optional: `allowedAddresses` via config; env: `ALLOWED_CONTRACT_ADDRESSES` (EXECUTE allowlist), `EXECUTE_WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY`.

**Optional:**

- `TREASURY_ADDRESS`, governor/voting token env vars for observe.
- `ORACLE_CACHE_TTL_MS`, `ORACLE_CACHE_MAX_ENTRIES`, `COINGECKO_API_KEY`.
- `REDIS_URL` (rate limiter, circuit breaker, Moltbook heartbeat state).
- `ERC8004_IDENTITY_REGISTRY_ADDRESS`, `AGENT_WALLET_ADDRESS`, `IPFS_GATEWAY_URL`.
- `REPUTATION_ATTESTATION_CONTRACT_ADDRESS`.
- `SLACK_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `ALERT_EMAIL`.
- `MOLTBOOK_API_KEY`, `MOLTBOOK_HEARTBEAT_INTERVAL`, `MOLTBOOK_SUBMOLT`.
- `LOG_LEVEL`, `SENTRY_DSN`.

---

## 5. How to Run & Build

**Prerequisites:** Node 18+, PostgreSQL, npm (or yarn).

**Install:**

```bash
cd aegis-agent
npm install
cp .env.example .env   # or copy from repo .env template and fill
# Edit .env: DATABASE_URL, AEGIS_API_KEY, OPENAI_API_KEY, PINECONE_*, CDP_*, RPC_*, etc.
npm run db:generate
npm run db:push        # or db:migrate
```

**Run:**

- **Next.js (API + dashboard):** `npm run dev` (then call `POST /api/agent/cycle` with Bearer token).
- **Agent only (one cycle):** `npm run agent:run`.
- **Agent with watch:** `npm run agent:dev`.

**Build:**

```bash
npm run typecheck
npm run lint
npm run build
```

**Tests:**

```bash
npm run test -- --run
# With DB:
DATABASE_URL=postgresql://user:pass@localhost:5432/aegis_test npm run test -- --run
```

**Contract tests (Foundry):**

```bash
forge test
```

**Moltbook registration:**

```bash
npm run register:moltbook
# Optional: --name Aegis --description "..."
# Then set MOLTBOOK_API_KEY in .env and complete claim_url.
```

---

## 6. Project Structure (concise)

```
aegis-agent/
├── app/
│   └── api/
│       ├── agent/cycle/route.ts   # POST cycle
│       ├── agent/price/route.ts  # GET price (x402)
│       ├── agent/status/route.ts  # GET health
│       └── reactive/event/route.ts # POST webhook
├── src/lib/
│   ├── agent/
│   │   ├── index.ts               # runAgentCycle, startAgent
│   │   ├── state-store.ts         # Redis / in-memory
│   │   ├── observe/              # blockchain, chains, oracles, treasury, defi, governance
│   │   ├── reason/                # prompts, schemas
│   │   ├── policy/                # rules
│   │   ├── execute/               # agentkit, alerts, circuit-breaker
│   │   ├── memory/               # store, embeddings
│   │   ├── payments/              # x402, x402-middleware
│   │   ├── identity/              # erc8004, reputation
│   │   └── social/                # moltbook, heartbeat
│   ├── api/schemas.ts
│   ├── auth/api-auth.ts
│   ├── logger.ts
│   └── security/data-masking.ts
├── prisma/schema.prisma
├── contracts/
│   ├── AegisReactiveObserver.sol
│   └── test/
├── scripts/register-moltbook.ts
├── tests/                         # Vitest: agent, api, integration, security
├── .github/workflows/test.yml     # CI: lint, typecheck, test, forge test, build
├── package.json
├── foundry.toml
└── .env                           # Not committed; see list above
```

---

## 7. Policy Rules (summary)

- **confidence-threshold:** Non-WAIT actions must have `confidence >= config.confidenceThreshold`.
- **readonly-mode:** In READONLY, only WAIT/ALERT_HUMAN allowed.
- **reasoning-required:** `reasoning` length ≥ 20.
- **parameters-required:** EXECUTE/SWAP/TRANSFER/REBALANCE must have `parameters`.
- **transaction-value-limit:** Estimated USD value ≤ `maxTransactionValueUsd` (oracles for ETH/value).
- **high-value-alert:** Warning when value > 50% of limit.
- **gas-price-limit:** When `currentGasPriceGwei` and `gasPriceMaxGwei` set, execution rejected if over.
- **rate-limiter:** When `maxActionsPerWindow` / `rateLimitWindowMs` set, enforced via state store.
- **address-whitelist:** When `allowedAddresses` set, TRANSFER recipient and EXECUTE contract must be in list.
- **slippage-protection:** For SWAP/REBALANCE, `slippageTolerance` ≤ `maxSlippageTolerance` when set.

---

## 8. CI (GitHub Actions)

- **Workflow:** `.github/workflows/test.yml` on push/PR to `main`/`develop`.
- **Steps:** Checkout → setup Node 20 → Postgres 16 service → `npm ci` → `prisma generate` → `prisma db push` → `npm run typecheck` → `npm run lint` → `npm run test -- --run` (with `DATABASE_URL`) → `forge test` → `npm run build`. Optional: codecov upload.

---

## 9. Contracts (Foundry)

- **AegisReactiveObserver.sol:** Subscribe to (chainId, target, eventName); only configured Reactive runtime can call `react(chainId, eventName, eventData)`; emits `Reacted`. Owner can set `reactiveRuntime`, transfer ownership.
- **Config:** `foundry.toml`: `src = "contracts"`, `solc = "0.8.20"`, `rpc_endpoints.base_sepolia = "${RPC_URL_BASE_SEPOLIA}"`.

---

## 10. Quick Reference for “What to Set”

| Goal                         | Env / action |
|-----------------------------|--------------|
| Run agent cycle via API     | `AEGIS_API_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, optional Pinecone, RPC, CDP |
| Event-driven cycles         | `REACTIVE_CALLBACK_SECRET`, same as above |
| x402 paid actions           | `X402_FACILITATOR_URL`, optional `X402_API_KEY`, facilitator contract/config |
| Moltbook heartbeat          | `MOLTBOOK_API_KEY`, run `register:moltbook` once, optional `REDIS_URL` |
| Live execution              | `AGENT_EXECUTION_MODE=LIVE`, CDP keys, `EXECUTE_WALLET_PRIVATE_KEY` for EXECUTE, `ALLOWED_CONTRACT_ADDRESSES` |
| Alerts                      | `SLACK_WEBHOOK_URL` and/or `ALERT_WEBHOOK_URL` |
| Rate limit / circuit state  | `REDIS_URL` (optional but recommended for multi-instance) |

---

## 11. Practical Q&A — Deep Understanding of the Agent

These questions build a high-level understanding of how the agent behaves in practice: when it acts, when it skips, what can fail, and how to reason about operations.

### When does the agent skip a cycle entirely?

| Condition | Effect | Where |
|-----------|--------|-------|
| **Circuit breaker OPEN** | Cycle aborted before Observe; no LLM, policy, or execute | `checkHealthBeforeExecution()` |
| **Reserve below critical** | `reserves.ETH < RESERVE_CRITICAL_ETH` (default 0.05) | Same |
| **Bundler unhealthy** | CDP/Pimlico health check fails or times out | Same |
| **Economic breaker open** | Gas price too high, runway too low, or ETH reserves below minimum | Economic circuit breaker |
| **No significant change** | Observation filter detects stable state (same low-gas wallets, reserves, gas); reasoning skipped, returns WAIT | `hasSignificantChange()` in `observation-filter.ts` |

**First run:** Always treated as significant (no previous observations to compare).

---

### When does the agent skip reasoning (LLM) but still store a decision?

When `hasSignificantChange()` returns false: same low-gas wallets, same reserves, same gas price, no new protocol budgets. The agent returns `{ action: 'WAIT', confidence: 0, reasoning: 'No significant changes detected' }` and stores that in memory. No LLM call — saves API cost during quiet periods.

---

### How does the agent pick which wallet to sponsor when there are multiple low-gas candidates?

- **Whitelist path:** If `WHITELISTED_LOW_GAS_CANDIDATES` is set (comma-separated addresses), only those addresses are considered. Otherwise Blockscout / ERC-8004 discovery supplies candidates.
- **Single-candidate path:** When exactly one low-gas candidate is observed, the **template response** (`single-low-gas-sponsor`) returns `SPONSOR_TRANSACTION` with that wallet — no LLM call.
- **Multi-candidate path:** LLM reasons over the list; output must include `agentWallet` and `protocolId`.

---

### What makes a wallet "legitimate" for sponsorship (policy)?

- **Historical txs:** `>= 5` on-chain transactions (`MIN_HISTORICAL_TXS`).
- **Abuse check:** Not flagged by `detectAbuse()` (scam contracts, known abuse patterns).
- **Protocol approval:** If `REQUIRE_AGENT_APPROVAL=true`, wallet must be in `ApprovedAgent` for that protocol.
- **Target allowlist:** `targetContract` (if provided) must be in the protocol's `whitelistedContracts`.

---

### In what order does the agent log on-chain, submit the UserOp, and deduct protocol budget?

1. **Log on-chain** — `logSponsorshipOnchain()` writes to ActivityLogger (immutable record).
2. **Submit UserOp** — `executePaymasterSponsorship()` sends to bundler; CDP pays gas.
3. **Deduct budget** — Only if bundler submission succeeds. If it fails, budget is **not** deducted (see TEST_REPORT / CDP guide).

---

### What stops the agent from sponsoring a malicious or arbitrary contract call?

- **Protocol whitelist:** `targetContract` must be in the protocol's `whitelistedContracts` or `ACTIVITY_LOGGER_ADDRESS`.
- **CDP allowlist:** The target must be allowlisted in the CDP Paymaster policy (Portal).
- **Calldata:** For ActivityLogger fallback, the agent uses `ping()` (no-op). For protocol targets, the agent encodes `execute(target, 0, data)`; `data` is typically empty or a safe no-op — not arbitrary user-supplied calldata.

---

### Why does the agent use ActivityLogger.ping() instead of empty calldata?

CDP rejects with `"simulation had no valid calls in calldata"` when the inner call reverts. ActivityLogger has no `fallback`/`receive`, so `execute(target, 0, 0x)` reverts. `ping()` is a no-op callable by anyone and succeeds. See [CDP-PAYMASTER-DEBUGGING-GUIDE.md](./CDP-PAYMASTER-DEBUGGING-GUIDE.md) and [TEST_REPORT.md](./TEST_REPORT.md).

---

### Why EntryPoint v0.6 and not v0.7?

Coinbase Smart Wallets use EntryPoint v0.6. Using v0.7 causes "Invalid user operation for entry point". Default in `bundler-client.ts` is `entryPoint06Address`; set `ENTRY_POINT_ADDRESS` only when you explicitly need v0.7.

---

### What must be allowlisted in the CDP Portal for sponsorship to succeed?

- **Target contract** — e.g. `ACTIVITY_LOGGER_ADDRESS` and any protocol `whitelistedContracts` you use.
- **Method (if CDP enforces per-method)** — e.g. `ping` on ActivityLogger.
- **Sender** — The sponsored smart wallet address may need to be allowlisted depending on CDP policy.

---

### When does the circuit breaker open vs just warn?

- **Main circuit breaker:** Opens after `failureThreshold` execution failures in `windowMs`; half-open after `cooldownMs`.
- **Economic breaker:** Opens when gas price > threshold, runway < 24h, or ETH reserves < minimum. Warnings (e.g. USDC reserve low) do **not** open it; they are logged.
- **Health check:** `checkHealthBeforeExecution()` returns `healthy: false` when reserve critical, bundler down, or circuit OPEN — cycle is skipped but circuit may stay closed.

---

### What happens when the LLM returns invalid JSON or an unsupported action?

- **Parsing / schema:** `DecisionSchema` (Zod) validates. On error, the agent falls back to `{ action: 'WAIT', confidence: 0, reasoning: '...' }`.
- **Unsupported action:** Policy or execute layer will reject; memory stores the outcome (e.g. POLICY_REJECTED).

---

### What data is masked before being sent to the LLM?

Sensitive fields (private keys, API keys, full addresses in some contexts) are masked by `maskSensitiveData()` in `src/lib/security/data-masking.ts` before inclusion in the reasoning context. Check that module for the exact list.

---

### Who can trigger an agent cycle and with what limits?

| Trigger | Auth | Execution mode allowed |
|---------|------|------------------------|
| **Interval timer** | None (internal) | LIVE (from config) |
| **POST /api/agent/cycle** | Bearer `AEGIS_API_KEY` | SIMULATION or READONLY only (LIVE blocked from API) |
| **POST /api/reactive/event** | Bearer + HMAC `REACTIVE_CALLBACK_SECRET` | Uses `X402_EXECUTION_MODE` or default |
| **x402 paid action** | Payment proof verification | `X402_EXECUTION_MODE` (default SIMULATION) |

---

### How does the observation filter decide "no significant change"?

`hasSignificantChange(observations, previousObservations)` compares:

- **Low-gas wallets** — Same set (by address).
- **Reserves** — ETH and USDC within threshold (default 1% change).
- **Gas price** — Within threshold.
- **Protocol budgets** — No material change.
- **New observations** — New `lowGas` or `protocolBudgets` entries count as significant.

If all checks pass, it returns false (no significant change); otherwise true. State is persisted in Redis or in-memory state store.

---

### When does the agent use templates vs calling the LLM?

- **Single low-gas candidate:** Template `single-low-gas-sponsor` returns `SPONSOR_TRANSACTION` with that wallet; no LLM call.
- **Multiple candidates or other patterns:** LLM is called. See `src/lib/agent/reason/template-responses.ts` for template conditions.

---

### What gets stored in memory when policy rejects a decision?

A memory record is stored with type `DECISION` (or equivalent), including the decision, outcome (e.g. POLICY_REJECTED), and observations. This supports learning and audit trails even when execution does not proceed.

---

### What is the practical difference between reserve pipeline and gas sponsorship mode?

| Aspect | Reserve pipeline | Gas sponsorship |
|--------|------------------|-----------------|
| **Interval** | 5 minutes | 60 seconds |
| **Observations** | Treasury, burn rate, runway, reserves | Low-gas wallets, protocol budgets, gas |
| **Actions** | REPLENISH_RESERVES, ALLOCATE_BUDGET, REBALANCE_RESERVES, ALERT | SPONSOR_TRANSACTION, SWAP_RESERVES, ALERT_PROTOCOL |
| **Circuit breaker** | Isolated per mode | Isolated per mode |
| **Purpose** | Manage agent's own treasury | Sponsor user transactions |

Both run via `MultiModeAgent` in a single process.

---

### Where does protocol budget come from and when is it deducted?

- **Source:** Registered via `POST /api/protocol/register` with `initialBalanceUSD`; top-ups via `POST /api/protocol/[id]/topup` (often x402 payment).
- **Deduction:** Only after `executePaymasterSponsorship()` returns `paymasterReady: true`. If the bundler rejects or times out, budget is **not** deducted (see paymaster flow in `paymaster.ts`).

---

This document plus the in-repo `.env` template and README should give full context to run, build, and extend Aegis.
