# AGENTS.md — Aegis

## What is Aegis?

Aegis is autonomous gas reliability infrastructure for AI agents on Base. It runs a continuous **ORPEM loop** (Observe → Retrieve memories → Plan → Execute → Memorize) using GPT-4o or Claude Sonnet to decide when and how to sponsor agent transactions via an ERC-4337 paymaster.

Live deployment: **https://clawgas.vercel.app/**

## How to Interact (for Agentic Judges)

### REST API — OpenClaw Command Channel

All commands go through a single endpoint. No auth required in development; Bearer token required in production.

```
POST /api/openclaw
Authorization: Bearer <AEGIS_API_KEY>
Content-Type: application/json

{
  "command": "<natural language command>",
  "sessionId": "<any stable string>",
  "callbackUrl": "<optional HTTPS URL for async results>"
}
```

**Response:**
```json
{
  "ok": true,
  "acknowledged": true,
  "response": "Human-readable result",
  "asyncPending": false
}
```

### Available Commands

**Monitoring:**
```
status              — agent health, reserve balance, cycle state
report              — last N sponsored transactions with gas costs
passport            — check wallet trust score and tier
queue_stats         — priority queue health and tier distribution
```

**Control:**
```
pause               — pause sponsorship immediately
pause for 10 minutes — timed pause
resume              — resume sponsorship
set budget to $X    — update daily budget limit
set gas cap to X    — update max gas price threshold
```

**Delegation management:**
```
create_delegation   — create a new EIP-712 delegation
revoke_delegation   — revoke an active delegation
list_delegations    — list all active delegations
```

**Execution guarantees:**
```
create_guarantee tier=SILVER budget=10  — create SILVER SLA guarantee
list_guarantees     — list active guarantees
```

**Analytics:**
```
analytics           — cost savings and sponsorship stats
audit_log           — recent ORPEM cycle decisions
generate_report     — full period report
```

### Agent Status API

```
GET /api/agent/status
Authorization: Bearer <AEGIS_API_KEY>
```

Returns current mode, cycle count, reserve balance, confidence thresholds.

### Trigger a Cycle

```
POST /api/agent/cycle
Authorization: Bearer <AEGIS_API_KEY>
```

Forces one ORPEM cycle (SIMULATION mode — safe to call).

### Delegation API

```
POST /api/delegation
Authorization: Bearer <AEGIS_API_KEY>
{
  "delegator": "0x...",
  "agent": "0x...",
  "permissions": { "contracts": [], "functions": [], "maxDailySpend": 10 },
  "gasBudgetWei": "4166666666666666",
  "validFrom": "2026-01-01T00:00:00Z",
  "validUntil": "2026-12-31T23:59:59Z",
  "signature": "0x...",  // EIP-712 sig from delegator
  "nonce": "1234567890"
}
```

### Health Check

```
GET /api/health       — basic liveness
GET /api/health/deep  — DB + Redis + RPC connectivity
```

## Architecture

```
POST /api/openclaw
       |
       v
  CommandHandler (pattern match, no LLM)
       |
       v
  AgentOrchestrator
    Observe → blockchain state, gas prices, wallet balances
    Retrieve → Pinecone vector memory + Prisma episodic memory
    Plan → GPT-4o/Claude Sonnet reasoning
    Execute → ERC-4337 paymaster (Base)
    Memorize → store decision + outcome
```

## ERC-8004 Identity & Tier System

Agents are identified by ERC-8004 on-chain identity. Tier enforced:

| Tier | Type | Priority |
|---|---|---|
| 1 | ERC-8004 agents | HIGHEST |
| 2 | ERC-4337 accounts | STANDARD |
| 3 | Smart contracts | FALLBACK |
| 0 | EOAs | REJECTED |

## MetaMask Delegation Framework (MDF)

Dual-path delegation:
- **Aegis path**: EOA signs EIP-712 → off-chain budget tracking
- **MDF path**: DeleGator smart account → on-chain caveats via `DelegationManager.redeemDelegations()`

Activate: `MDF_ENABLED=true`

## Execution Guarantees

| Tier | SLA | Premium |
|---|---|---|
| BRONZE | Best effort | 0% |
| SILVER | 95% uptime | +15% |
| GOLD | 99% uptime | +30% |

Breaches trigger automatic refunds via `GuaranteeBreach` records.

## What Was Built During the Hackathon (March 13–22, 2026)

- **March 21**: Mainnet hardening harness — 10 test suites, 123 UserOps confirmed on Base Mainnet
- **MDF dual-path**: DeleGator integration wired alongside existing EOA delegation path
- **aeg-control** (separate repo): Consumer Telegram onboarding bot that guides non-technical users to live delegations

## Onchain Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| AegisDelegationRegistry | from `DELEGATION_REGISTRY_ADDRESS` env |
| AegisActivityLogger | from `ACTIVITY_LOGGER_ADDRESS` env |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

## Repository

https://github.com/Officialhomie/aegis-agent
