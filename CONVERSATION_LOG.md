# Aegis Agent — Conversation Log

> Human-AI collaboration log for The Synthesis hackathon (March 13-22, 2026).
> Built by **Victor (Officialhomie)** with **Claude Code** (Anthropic).

---

## Project Summary

**Aegis** is autonomous gas reliability infrastructure for AI agents on Base. It observes blockchain state, reasons with an LLM, validates decisions through a policy engine, and executes gas sponsorships via account abstraction (ERC-4337). It implements agent-first prioritization (ERC-8004 > ERC-4337 > smart contracts; EOAs rejected), on-chain delegation with an audit trail, and a natural language command interface (OpenClaw).

- **Tech stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, viem, Coinbase AgentKit, Vitest, Foundry
- **Contracts:** 3 deployed on Base Sepolia (AegisActivityLogger, AegisReactiveObserver, AegisDelegationRegistry)
- **819 commits** over 47 days (Jan 29 – Mar 16, 2026)
- **975 tests passing**, 0 failures

---

## How We Built Together

### Phase 0: Architecture & Core Agent (Jan 29 – Mar 12)

Victor designed the ORPEM (Observe-Reason-Policy-Execute-Memory) loop and Claude Code helped scaffold the full system:

- **Observation layer:** Blockchain state via viem, gas prices, treasury balances, oracle feeds, protocol budgets, Dune Analytics, and ERC-8004 identity lookups.
- **Reasoning engine:** Structured LLM output via Zod schemas. Claude helped design the `DecisionSchema` with confidence scores, preconditions, and expected outcomes.
- **Policy engine:** Safety-first rule chain — every decision passes through confidence, gas price, value cap, rate limit, whitelist, slippage, and sponsorship-specific rules. Claude wrote the fail-closed pattern for database-unavailable scenarios.
- **Execution:** Paymaster-based gas sponsorship with EIP-712 signed decisions, simulation mode, and circuit breakers. Claude authored the `signDecision` flow using viem's `hashMessage` and `privateKeyToAccount`.
- **Memory:** Prisma + Pinecone vector store for decision history and semantic retrieval.

Key AI-authored sections:
- `src/lib/agent/policy/sponsorship-rules.ts` — 12 ordered safety rules
- `src/lib/agent/execute/paymaster.ts` — decision signing + paymaster sponsorship
- `src/lib/agent/queue/` — priority queue with tier-based dequeue
- `src/lib/delegation/` — Zod schemas, service layer, and on-chain registry integration
- `src/lib/agent/openclaw/` — natural language command parser, rate limiter, confirmation flow

### Phase 1: Fix All 39 Failing Tests (Mar 16)

The test suite had 39 failures across 8 test files. Claude Code diagnosed and fixed every one:

| Root Cause | Files Affected | Fix |
|---|---|---|
| **Temporal Dead Zone (TDZ)** — `vi.mock()` hoisted before `const` declarations | paymaster, sponsorship-policy, approved-agent-check, delegation-rules | Wrap mock vars with `vi.hoisted(() => vi.fn())` |
| **Missing mocks** — policy rules calling unmocked DB/services | sponsorship-policy, approved-agent-check, policy | Add mocks for `protocol/onboarding`, `runtime-overrides`, `gas-passport`, `lib/db` |
| **Timer hanging** — `sleep(20_000)` in Moltbook tests | moltbook-conversationalist (7 tests) | `vi.useFakeTimers()` + `advanceTimersByTimeAsync(100_000)` |
| **Field name mismatch** — `validFromMs`/`validUntilMs` renamed to `validFrom`/`validUntil` | delegation/service, delegation/schemas | Update test data to use ISO date strings |
| **Null crash** — `passport.sponsorCount` when passport is null | sponsorship-rules.ts (source bug) | Add `passport != null &&` guard |
| **Static mock** — `createOpenClawSession` returning fixed sessionId | openclaw integration | `mockImplementation((id) => ({ sessionId: id }))` |
| **Missing schema validation** — no `.refine()` for expired delegations | delegation/schemas.ts (source) | Add two `.refine()` checks |

Result: **975 tests pass, 0 failures.**

### Phase 2: Public Deployment (Mar 16)

Claude Code deployed Aegis to Vercel:

1. Created `vercel.json` with 30s function timeout for API routes
2. Linked existing `onetruehomies-projects/aegis-agent` Vercel project
3. Deployed with `vercel --prod` — build succeeded in 6 minutes
4. Verified all health endpoints:
   - `GET /api/health` — reserve state initializing
   - `GET /api/health/deep` — 6/6 components healthy (database, redis, bundler, rpc, wallet, sponsorship)
   - `POST /api/agent/cycle` — returned `SPONSOR_TRANSACTION` with confidence 0.85

**Live URL:** https://clawgas.vercel.app

### Phase 3: Contract Deployment (Mar 16)

Three contracts on Base Sepolia:

| Contract | Address | Deployer |
|---|---|---|
| AegisActivityLogger | `0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97` | Previously deployed |
| AegisReactiveObserver | `0x33076cd9353d1285cb9132a94d8d062306096376` | Previously deployed |
| AegisDelegationRegistry | `0xEd4EF89E88775Ca9832706Fc7A06Fe4a596811a2` | Claude Code via `forge script` |

Claude wrote the Foundry deploy script (`script/DeployDelegationRegistry.s.sol`) and deployed using the `aegis-agent` keystore with the agent wallet as constructor argument.

---

## Architecture Decisions Made with AI

### 1. Agent-First Prioritization (Tier System)
**Decision:** Reject all EOA requests. Prioritize ERC-8004 registered agents (Tier 1), then ERC-4337 smart accounts (Tier 2), then generic smart contracts (Tier 3).

**Rationale (discussed with Claude):** Aegis exists to serve autonomous agents, not human wallets. EOAs can use faucets. Tiering ensures scarce gas budget goes to the most verifiable agents first.

**Implementation:** `src/lib/agent/validation/account-validator.ts` checks bytecode + ERC-8004 registry. Queue uses tier for priority dequeue.

### 2. Fail-Closed Policy Engine
**Decision:** If any policy rule throws an exception (e.g., database unavailable), the decision is REJECTED, not approved.

**Rationale:** For an autonomous gas sponsorship agent handling real funds, a permissive failure mode is unacceptable. Claude suggested wrapping each rule in a try-catch that returns `ERROR` status on exception.

### 3. EIP-712 Signed Decisions
**Decision:** Every sponsorship decision is hashed and signed by the agent wallet before execution, creating a verifiable audit trail.

**Rationale:** Enables on-chain logging via AegisActivityLogger without trusting the execution layer. The signed decision can be verified by anyone.

### 4. On-Chain Delegation Registry
**Decision:** Store delegation state off-chain (Prisma) for fast validation, but write an immutable audit trail to the on-chain `AegisDelegationRegistry`.

**Rationale:** Fast reads for the paymaster validation path, but full verifiability for disputes and compliance.

---

## Debugging Sessions

### TDZ Bug Pattern (Most Common)
Claude identified a systematic pattern across 4 test files: Vitest's `vi.mock()` is hoisted to the top of the module, running before any `const` declarations. When a mock factory references a `const mockFn = vi.fn()`, it hits a Temporal Dead Zone error. The fix — `vi.hoisted(() => vi.fn())` — runs the initializer at hoist time.

### Moltbook Timer Deadlock
7 tests hung for 10+ seconds each. Root cause: the skill calls `sleep(REPLY_INTERVAL_MS)` (20 seconds) between replies, and the test awaited the result synchronously. Claude's fix: use `vi.useFakeTimers()`, start the execution as a promise without awaiting, advance the clock by 100 seconds, then await the result.

### Passport Null Crash
`sponsorship-rules.ts` accessed `passport.sponsorCount` without a null check. When `getPassport()` returned null (agent not registered), the rule crashed instead of failing gracefully. Claude added `passport != null &&` to the guard expression.

---

## Code Sections Written by AI

Claude Code authored or substantially modified:

- **Test infrastructure:** All 16 test files fixed in Phase 1 (mocks, timers, assertions)
- **Source fixes:** `sponsorship-rules.ts` null guard, `delegation/schemas.ts` refine validations, `openclaw/parsers.ts` duration parser
- **Deployment:** `vercel.json`, `script/DeployDelegationRegistry.s.sol`
- **Policy rules:** Contributed to the fail-closed patterns in `sponsorship-rules.ts` and `approved-agent-check` rule
- **Queue consumer:** Mock architecture for `queue-consumer.test.ts` including validateAccount integration

Victor authored the core architecture, business logic, smart contracts, database schema, API routes, and frontend.

---

## Timeline

| Date | Milestone |
|---|---|
| Jan 29 | Project initialized — Next.js + Prisma + viem |
| Feb – Mar 12 | Core ORPEM loop, policy engine, sponsorship flow, OpenClaw, delegation, queue system (800+ commits) |
| Mar 13 | The Synthesis hackathon begins |
| Mar 16 | Phase 1: All 39 test failures fixed (975 pass) |
| Mar 16 | Phase 2: Deployed to https://clawgas.vercel.app |
| Mar 16 | Phase 3: AegisDelegationRegistry deployed to Base Sepolia |
| Mar 22 | Hackathon deadline |

---

## Tools Used

- **Claude Code** (Anthropic) — primary AI coding assistant
- **Vitest** — test framework
- **Foundry** (forge, cast) — Solidity compilation and deployment
- **Vercel** — hosting and serverless deployment
- **Supabase** — PostgreSQL database
- **Alchemy** — RPC provider for Base and Base Sepolia
- **Pimlico** — bundler for ERC-4337 UserOperations
- **Pinecone** — vector database for agent memory
