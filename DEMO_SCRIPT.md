# Aegis Demo Script

> 5-step walkthrough for The Synthesis hackathon judges.
> Live URL: https://clawgas.vercel.app

---

## Prerequisites

```bash
BASE_URL="https://clawgas.vercel.app"
API_KEY="sn98LHQlYRkfHcGESRniD7JLxchC4L5gl4TyDVfKu/U="
```

---

## Step 1: Health Check — All Systems Green

```bash
curl -s "$BASE_URL/api/health/deep" | jq .
```

**Expected:** `status: "healthy"` with 6/6 components green:
- database (PostgreSQL via Supabase)
- redis (state store)
- bundler (Pimlico ERC-4337)
- rpc (Base via Alchemy)
- agent_wallet (0x7B9763b416F89aB9A2468d8E9f041C4542B5612f)
- sponsorship (queue healthy)

---

## Step 2: Agent Passport — Identity & Tier Lookup

Look up the Aegis agent wallet's gas passport:

```bash
curl -s "$BASE_URL/api/v1/passport/0x7B9763b416F89aB9A2468d8E9f041C4542B5612f" | jq .
```

**Shows:** Agent tier, sponsorship history, reputation score, and ERC-8004 identity status.

---

## Step 3: EOA Rejection — Agent-First Enforcement

Submit a plain EOA address for sponsorship eligibility:

```bash
curl -s "$BASE_URL/api/v1/sponsorship/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{"agentWallet": "0x0000000000000000000000000000000000000001", "protocolId": "test-protocol"}' | jq .
```

**Expected:** Rejected with `"Agent rejected: Address is an EOA (no contract bytecode)"`, `agentTier: 0`, `accountType: "EOA"`. Aegis only serves autonomous agents (ERC-4337 or ERC-8004).

---

## Step 4: Smart Account Approval — Tier 2 Eligible

Submit an ERC-4337 smart account address:

```bash
curl -s "$BASE_URL/api/v1/sponsorship/check-eligibility" \
  -H "Content-Type: application/json" \
  -d '{"agentWallet": "0x0a8Cf29A55cAb0833A27A3A50A333614c602858a", "protocolId": "test-protocol"}' | jq .
```

**Expected:** Approved. ERC-4337 smart accounts are Tier 2 and eligible for gas sponsorship.

---

## Step 5: Live Agent Cycle — ORPEM Loop

Trigger a full Observe-Reason-Policy-Execute-Memory cycle:

```bash
curl -s -X POST "$BASE_URL/api/agent/cycle" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Expected:** The agent:
1. **Observes** gas prices, wallet balances, protocol budgets (8+ data sources)
2. **Reasons** about sponsorship opportunities via Claude LLM
3. Returns a `SPONSOR_TRANSACTION` decision with confidence score
4. In SIMULATION mode: signs the decision (EIP-712) but does not broadcast
5. In LIVE mode: submits UserOp via Pimlico bundler, logs to AegisActivityLogger on Base Sepolia

**Key fields in response:**
- `state.currentDecision.action` — `SPONSOR_TRANSACTION` or `WAIT`
- `state.currentDecision.confidence` — 0.0 to 1.0 (must exceed 0.75 threshold)
- `state.currentDecision.parameters.agentWallet` — the wallet being sponsored
- `state.observationsCount` — number of data sources observed

---

## Contracts on Base Sepolia

| Contract | Address | Basescan |
|---|---|---|
| AegisActivityLogger | `0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97` | [View](https://sepolia.basescan.org/address/0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97) |
| AegisReactiveObserver | `0x33076cd9353d1285cb9132a94d8d062306096376` | [View](https://sepolia.basescan.org/address/0x33076cd9353d1285cb9132a94d8d062306096376) |
| AegisDelegationRegistry | `0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2` | [View](https://sepolia.basescan.org/address/0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2) |

---

## Key Differentiators

1. **Agent-First:** Only serves autonomous agents (ERC-4337/ERC-8004). EOAs rejected at every entry point.
2. **Safety-First Policy Engine:** 12 ordered rules, fail-closed on exceptions, rate-limited.
3. **Full Audit Trail:** EIP-712 signed decisions, on-chain activity logging, delegation registry.
4. **Multi-Mode:** Reserve pipeline (treasury) + gas sponsorship running concurrently.
5. **OpenClaw:** Natural language command interface for protocol operators.
6. **975 Tests Passing:** Comprehensive test coverage across unit, integration, and security tests.
