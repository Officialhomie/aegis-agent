# Aegis Agent Integration Guide

**How any onchain agent can tap into Aegis for autonomous gas sponsorship on Base**

> **Visibility:** This document is intended to be public. Publish it in your repo README, developer portal, and any hackathon submissions. The more agents that integrate, the stronger the network effect. There are no secrets here — auth keys are per-operator, not global.

---

## What Aegis Does for Your Agent

Aegis is autonomous gas reliability infrastructure. It watches your agent's wallet, detects when gas is low, validates the transaction against a policy engine (confidence, value, rate limits, delegation scope, reputation), and sponsors the UserOp through a sovereign paymaster — without CDP allowlist approval, without human intervention.

Your agent never stalls because of gas. That is the only promise Aegis makes, and it delivers it onchain with an immutable `Sponsorship` event for every transaction it sponsors.

---

## Who Can Integrate

| Account Type | Supported | Priority | Notes |
|---|---|---|---|
| ERC-8004 registered agent | Yes | Tier 1 — HIGHEST | 3x budget multiplier, expedited queue |
| ERC-4337 smart account | Yes | Tier 2 — STANDARD | Standard budget multiplier |
| Generic smart contract | Yes | Tier 3 — FALLBACK | 0.5x budget, deprioritized |
| EOA (externally owned account) | No | Rejected | Aegis is agent-first by design |

**EOAs are permanently rejected.** Aegis enforces an agent-first policy at the protocol level. If your wallet has no bytecode, no sponsorship will be issued under any circumstances.

---

## Integration Paths

There are three ways to integrate, ordered from simplest to most powerful:

### Path A — Pull Sponsorship (Zero Setup)

Aegis autonomously discovers low-gas smart accounts on Base and sponsors them without any integration on your side. Your agent just needs to be:
- A deployed smart contract (ERC-4337 preferred)
- Registered under a protocol that has a budget with Aegis
- Not blocklisted

No API calls required from your agent. Aegis's observation loop finds you.

### Path B — Push Sponsorship Request

Your agent actively requests sponsorship via the REST API. This gives you control over timing and gives Aegis more context to make better decisions.

```
POST /api/v1/sponsorship/request
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "agentWallet": "0xYourSmartAccountAddress",
  "protocolId": "your-protocol-id",
  "estimatedCostUSD": 0.05,
  "targetContract": "0x...",
  "maxGasLimit": 300000
}
```

Response:
```json
{
  "requestId": "req_abc123",
  "position": 4,
  "status": "pending",
  "statusUrl": "/api/agent/request-status/req_abc123"
}
```

Poll for the result:
```
GET /api/agent/request-status/req_abc123
Authorization: Bearer <AEGIS_API_KEY>
```

When status is `completed`:
```json
{
  "status": "completed",
  "txHash": "0x...",
  "userOpHash": "0x...",
  "actualCostUSD": 0.047,
  "explorerUrl": "https://basescan.org/tx/0x..."
}
```

### Path C — Delegation (Full Trust Model)

A user or protocol grants your agent bounded authority via an EIP-712 signed delegation. Aegis enforces the delegation's permissions before sponsoring. This is the highest-trust integration and unlocks delegation-specific policy rules.

Two sub-paths exist within delegation:

- **AEGIS path**: Off-chain EIP-712 policy enforcement. User signs a delegation struct, Aegis stores it, checks 6 policy rules on every sponsorship.
- **MDF path**: MetaMask Delegation Framework. User has a DeleGator smart account. On-chain caveats (allowed targets, time windows, value caps) replace 4 off-chain rules. Aegis builds `redeemDelegations` calldata automatically.

See the Delegation section below for full details.

---

## Step 1 — Get an API Key

Contact the Aegis team or self-host the Aegis stack. A single `AEGIS_API_KEY` is used for all agent and delegation operations.

All protected routes use Bearer token auth:
```
Authorization: Bearer <AEGIS_API_KEY>
```

---

## Step 2 — Register Your Protocol (Sponsor)

If your protocol wants to sponsor its agents' gas, register and fund a budget:

```
POST /api/v1/protocol/register
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "protocolId": "my-protocol",
  "name": "My Protocol",
  "notificationEmail": "ops@myprotocol.xyz",
  "initialDepositTxHash": "0x...",
  "whitelistedContracts": ["0xContractA", "0xContractB"],
  "estimatedMonthlyVolume": 50000
}
```

Response includes your protocol API key. Keep it safe — it is hashed in the database and cannot be recovered.

After registration, the protocol enters simulation mode. The first real sponsorship moves it to `ACTIVE` production mode.

---

## Step 3 — Register Your Agent (Optional, Unlocks Tier 1)

ERC-4337 accounts are detected automatically. To achieve Tier 1 status (3x budget, highest queue priority), register on the ERC-8004 Identity Registry:

```
POST /api/agent/register
Authorization: Bearer <AEGIS_API_KEY>
```

This uploads agent metadata to IPFS and calls `register(agentURI)` on the ERC-8004 registry. Returns:
```json
{
  "agentId": "42",
  "txHash": "0x...",
  "registryAddress": "0x..."
}
```

The `agentId` is stored against your wallet address. All subsequent sponsorship decisions use this to grant Tier 1 priority.

---

## Step 4 — Check Eligibility (Dry Run)

Before submitting a real request, verify your agent passes current policy:

```
GET /api/v1/sponsorship/check-eligibility?agentWallet=0x...&protocolId=my-protocol&estimatedCostUSD=0.05
Authorization: Bearer <AEGIS_API_KEY>
```

Response:
```json
{
  "eligible": true,
  "agentTier": 2,
  "accountType": "ERC4337_ACCOUNT",
  "appliedRules": ["tier-validation", "budget-check", "gas-price-check", ...],
  "warnings": [],
  "errors": []
}
```

If `eligible` is false, `errors` will tell you exactly which policy rule blocked the request.

---

## Step 5 — Request Sponsorship

See Path B above. The request is queued and processed asynchronously. Typical latency is under 10 seconds for Tier 1 agents, under 30 seconds for Tier 2.

---

## Delegation Framework

### AEGIS Path (Off-Chain EIP-712)

**1. Sign the delegation (run once per user)**

The delegator signs an EIP-712 struct scoping what your agent is allowed to do on their behalf.

EIP-712 domain:
```json
{
  "name": "AegisDelegation",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": "0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2"
}
```

Struct type:
```
Delegation(address delegator, address agent, bytes32 permissionsHash, uint256 gasBudgetWei, uint256 validFrom, uint256 validUntil, uint256 nonce)
```

Use `scripts/sign-aegis-delegation.ts` to generate the signature locally:
```bash
DELEGATOR_PRIVATE_KEY=0x... \
AGENT_WALLET_ADDRESS=0xYourAgentAddress \
DELEGATION_REGISTRY_ADDRESS=0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2 \
DELEGATION_CHAIN_ID=8453 \
DELEGATION_GAS_BUDGET_WEI=1000000000000000 \
DELEGATION_VALID_DAYS=30 \
npx tsx scripts/sign-aegis-delegation.ts > /tmp/delegation.json
```

**2. Submit to Aegis**

```
POST /api/delegation
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "delegator": "0xUserAddress",
  "agent": "0xYourAgentAddress",
  "permissions": {
    "contracts": [],
    "functions": [],
    "maxValuePerTx": "0",
    "maxGasPerTx": 500000,
    "maxDailySpend": 100,
    "maxTxPerDay": 50,
    "maxTxPerHour": 10
  },
  "gasBudgetWei": "1000000000000000",
  "validFrom": "2026-03-28T00:00:00Z",
  "validUntil": "2026-04-28T00:00:00Z",
  "signature": "0x...",
  "nonce": "1743150000000"
}
```

Response: `{ "id": "cmxxx...", "status": "ACTIVE", ... }`

**Permissions fields explained:**

| Field | Default | Meaning |
|---|---|---|
| `contracts` | `[]` | Empty = all contracts allowed. Non-empty = whitelist. |
| `functions` | `[]` | Empty = all function selectors allowed. |
| `maxValuePerTx` | `"0"` | Max ETH value per tx in wei. `"0"` = no limit. |
| `maxGasPerTx` | `500000` | Gas units cap per transaction. |
| `maxDailySpend` | `100` | USD daily spend cap. |
| `maxTxPerDay` | `50` | Max transactions per 24h. |
| `maxTxPerHour` | `10` | Max transactions per 1h. |

**3. Policy rules that run for AEGIS-path delegations**

All 6 standard rules plus the shared rate-limit rule:
1. EIP-712 signature verification (delegator must have signed)
2. Scope check (target contract + function selector must match permissions)
3. Value check (`maxValuePerTx` enforced)
4. Expiry check (`validFrom` / `validUntil` window)
5. Budget check (cumulative `gasBudgetWei` not exceeded)
6. Delegation rate limit

---

### MDF Path (On-Chain Caveats via MetaMask DeleGator)

For users with a MetaMask DeleGator smart account, the AEGIS delegation can be upgraded to MDF mode. This moves enforcement of rules 2–5 on-chain, delegating to the `DelegationManager` contract.

**1. Create the standard AEGIS delegation first** (same as above).

**2. User signs an MDF Delegation struct**

```bash
AGENT_NETWORK_ID=base \
MDF_DELEGATE_ADDRESS=0xYourAgentAddress \
MDF_DELEGATOR_PRIVATE_KEY=0xDelegatorKey \
MDF_DELEGATION_MANAGER_ADDRESS_BASE=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3 \
npx tsx scripts/sign-mdf-delegation.ts > /tmp/mdf.json
```

**3. Upgrade the existing delegation**

```
POST /api/delegation/<DELEGATION_ID>/mdf-upgrade
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "mdfDelegation": {
    "delegate": "0xYourAgentAddress",
    "delegator": "0xDelegatorSmartAccount",
    "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "caveats": [],
    "salt": "1743150000000",
    "signature": "0x..."
  },
  "delegationManagerAddress": "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3",
  "chainId": 8453
}
```

Response: `{ "success": true, "mdfDelegationHash": "0x...", "message": "Delegation upgraded to MDF mode" }`

After upgrade, Aegis automatically detects `delegatorAccountType = DELEGATOR` and builds `redeemDelegations` calldata for every sponsored UserOp. Additionally, **policy rule 7** (`mdf-delegation-revocation-check`) runs on every sponsorship cycle, calling `isDelegationDisabled()` on the DelegationManager to verify the delegation has not been revoked onchain.

**Supported caveat enforcers (Base Mainnet):**

| Enforcer | Purpose |
|---|---|
| `AllowedTargets` | Whitelist of allowed target contracts |
| `AllowedMethods` | Whitelist of allowed function selectors |
| `Timestamp` | Valid-after / valid-before time window |
| `ValueLte` | Maximum ETH value per call |
| `NonceEnforcer` | Replay protection |
| `ERC20TransferAmount` | Max ERC-20 transfer amount |

---

## Execution Guarantees

For agents that require SLA commitments on sponsorship delivery:

```
POST /api/v1/guarantees
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "type": "GAS_BUDGET",
  "beneficiary": "0xYourAgentAddress",
  "protocolId": "my-protocol",
  "budgetUsd": 500,
  "tier": "SILVER",
  "validFrom": "2026-03-28T00:00:00Z",
  "validUntil": "2026-04-28T00:00:00Z"
}
```

| Tier | SLA | Premium | Refund on Breach |
|---|---|---|---|
| BRONZE | Best effort | 0% | None |
| SILVER | 95% within 5 min | 15% | 50% of batch |
| GOLD | 99% within 2 min | 30% | 100% of batch |

**Guarantee types:**
- `GAS_BUDGET` — Reserve $X for agent transactions
- `TX_COUNT` — Reserve N transactions
- `TIME_WINDOW` — Execute within X milliseconds or refund

Check remaining capacity:
```
GET /api/v1/guarantees/<GUARANTEE_ID>/usage
Authorization: Bearer <AEGIS_API_KEY>
```

---

## Gas Passport (Trust Score)

Every sponsored wallet accumulates a Gas Passport — an onchain reputation score computed from sponsorship history.

```
GET /api/v1/passport?agent=0xYourAgentAddress
```

No auth required. This is a public endpoint.

Response:
```json
{
  "agent": "0x...",
  "sponsorCount": 42,
  "successRateBps": 9800,
  "protocolCount": 3,
  "firstSponsorTime": 1743000000,
  "totalValueSponsored": 87.50,
  "reputationHash": null
}
```

`successRateBps` of 9800 = 98% success rate. Agents with at least 10 sponsorships and a 95%+ success rate receive preferential treatment in the policy engine — the historical-transaction requirement is relaxed.

You can also look up by ERC-8004 ID:
```
GET /api/v1/passport?agentOnChainId=42
```

---

## OpenClaw — Natural Language Interface

Aegis exposes a natural language command API that any agent or messaging integration (WhatsApp, Telegram, Signal) can use without knowing the REST schema:

```
POST /api/openclaw
Content-Type: application/json

{
  "command": "sponsor 0xYourAgentAddress my-protocol",
  "sessionId": "agent-session-001"
}
```

No auth required. Rate-limited per session.

Core commands available to all callers:
- `status` — System health and current cycle state
- `sponsor <address> <protocolId>` — Trigger a sponsorship check
- `passport <address>` — Get trust score
- `queue` — Queue health and tier breakdown

When `OPENCLAW_EXPANDED=true`, full CRUD over delegations, guarantees, protocols, and agents is available via natural language.

---

## Onchain Verification

Every sponsorship is logged to `AegisActivityLogger` on Base Mainnet:

- **Contract**: `0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97`
- **Event**: `Sponsorship(address indexed agentWallet, string protocolId, bytes32 decisionHash, uint256 costMicroUsd, uint256 blockNumber, string metadata)`
- **Topic0**: `0x8ab1b0dcd1d4cd981f425189ee2768574236b1c4cb4fba71a749da92e84f02eb`

Query all sponsorships for your agent using cast:
```bash
cast logs \
  --rpc-url <BASE_RPC_URL> \
  --address 0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97 \
  --from-block <START_BLOCK> \
  "Sponsorship(address,string,bytes32,uint256,uint256,string)"
```

Or via the Aegis dashboard:
```
GET /api/dashboard/verify?agentWallet=0x...
Authorization: Bearer <AEGIS_API_KEY>
```

The `decisionHash` in each event is deterministic:
```
keccak256(encodePacked("aegis-decision", agentWallet, userOpTxHash))
```

This lets you independently verify that a specific UserOp was sponsored by Aegis and trace it back to the exact policy decision that approved it.

---

## Reactive Integration (Event-Driven)

If your system emits events that should trigger Aegis sponsorship cycles, use the Reactive Network webhook:

```
POST /api/reactive/event
X-Reactive-Signature: <HMAC-SHA256 of body>
Content-Type: application/json

{
  "eventType": "LOW_GAS_DETECTED",
  "agentAddress": "0x...",
  "blockNumber": 43960000,
  "data": { ... }
}
```

Aegis runs one full ORPEM cycle with `eventData` injected into the observation context. Use `REACTIVE_CALLBACK_SECRET` for HMAC verification.

---

## Heartbeat / Liveness Monitoring

Aegis can monitor your agent's liveness and post onchain proof at a configurable interval:

```
POST /api/openclaw
Content-Type: application/json
{ "command": "start_heartbeat 0xYourAgentAddress 900000", "sessionId": "hb-01" }
```

This creates a `HeartbeatSchedule` entry. Every `intervalMs` (default: 15 minutes), Aegis posts a liveness transaction onchain and records it in `HeartbeatRecord`. If a heartbeat is missed, alerts are triggered.

---

## API Reference Summary

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | None | System health |
| `/api/v1/passport?agent=0x...` | GET | None | Gas Passport (public) |
| `/api/openclaw` | POST | None (rate-limited) | Natural language commands |
| `/api/v1/sponsorship/check-eligibility` | GET | Bearer | Dry-run policy check |
| `/api/v1/sponsorship/request` | POST | Bearer | Submit sponsorship request |
| `/api/agent/request-status/:id` | GET | Bearer | Poll request status |
| `/api/agent/register` | POST | Bearer | ERC-8004 registration |
| `/api/agent/price` | GET | Bearer | Current sponsorship pricing |
| `/api/agent/:address/delegations` | GET | Bearer | Agent's delegations |
| `/api/v1/protocol/register` | POST | Bearer | Register as protocol sponsor |
| `/api/v1/protocol/:id/stats` | GET | Protocol key | Sponsorship stats |
| `/api/v1/guarantees` | POST/GET | Bearer | Create/list guarantees |
| `/api/v1/guarantees/:id/usage` | GET | Bearer | Guarantee usage |
| `/api/delegation` | POST/GET | Bearer | Create/list delegations |
| `/api/delegation/:id/mdf-upgrade` | POST | Bearer | Upgrade to MDF path |
| `/api/delegation/:id/usage` | GET | Bearer | Delegation gas usage |
| `/api/dashboard/stats` | GET | Bearer | Aggregate stats |
| `/api/dashboard/activity` | GET | Bearer | Activity log |
| `/api/reactive/event` | POST | HMAC | Event-driven cycle trigger |

---

## Quick Start Checklist

- [ ] Confirm your agent is a deployed smart contract (not an EOA)
- [ ] Get `AEGIS_API_KEY` from the Aegis operator
- [ ] Run `GET /api/v1/sponsorship/check-eligibility` to confirm eligibility
- [ ] (Optional) Register on ERC-8004 for Tier 1 priority: `POST /api/agent/register`
- [ ] (Optional) Register your protocol and fund a budget: `POST /api/v1/protocol/register`
- [ ] Submit a test sponsorship request: `POST /api/v1/sponsorship/request`
- [ ] Poll `GET /api/agent/request-status/:requestId` until `status === "completed"`
- [ ] Verify the `Sponsorship` event onchain at `AegisActivityLogger`
- [ ] (Optional) Create a delegation for scoped permissions: `POST /api/delegation`
- [ ] (Optional) Upgrade to MDF for onchain caveat enforcement: `POST /api/delegation/:id/mdf-upgrade`
- [ ] (Optional) Create an execution guarantee: `POST /api/v1/guarantees`

---

## Should This Document Be Public?

Yes. Publish it.

Aegis is designed as open infrastructure. The API keys are per-operator and per-protocol — there is no global secret in this document. Publishing this guide benefits Aegis by growing the number of integrated agents, which increases activity on `AegisActivityLogger` and strengthens the economic model (more protocols funding budgets, more agents building Gas Passports, more data for the policy engine).

Recommended places to publish:
- Your project's GitHub repository as `docs/AGENT_INTEGRATION_GUIDE.md`
- Developer portal or docs site
- Hackathon submissions and pitch decks
- Any Base ecosystem developer resource lists

The only things that should NOT be public: your specific `AEGIS_API_KEY`, protocol API keys, and private keys used for signing. Those stay in `.env`.

---

## Onchain Addresses Reference

| Contract | Network | Address |
|---|---|---|
| AegisActivityLogger | Base Mainnet | `0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97` |
| AegisDelegationRegistry | Base Mainnet | `0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2` |
| DelegationManager (MetaMask) | Base Mainnet | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| EntryPoint v0.7 | Base Mainnet + Sepolia | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| USDC | Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDC | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

*Aegis is live on Base Mainnet at `clawgas.vercel.app`. Source: `aegis-agent` monorepo.*
