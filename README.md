# Aegis Agent

**Autonomous Gas Reliability Infrastructure for Agents on Base**

> **Synthesis.md Hackathon Submission** — Theme: *Agents that pay*
>
> Agents can't transact without gas. Aegis solves gas reliability for autonomous agents on Base through a protocol-owned paymaster that sponsors transactions without requiring CDP allowlist approval. Any protocol can register, fund a budget, and have its agents sponsored in minutes — not 5–7 days.
>
> Now with **MetaMask Delegation Framework (MDF)** integration: users grant agents bounded on-chain authority via caveats (target whitelist, function selectors, value caps, time windows). Aegis sponsors the gas. Three independent trust layers — AI intent analysis + deterministic policy rules + on-chain caveats — must all agree before any transaction executes.

Aegis prevents execution failure by autonomously sponsoring transactions for legitimate agents who are low on gas — with zero human intervention. Designed as agent-native infrastructure, Aegis serves trading bots, deployment agents, DAO executors, and other autonomous systems, ensuring the Base agent economy never stalls due to gas constraints.

---

## Sovereign Paymaster — No CDP Required

The core infrastructure gap this solves: CDP's paymaster requires a manual allowlist approval process (5–7 business days). For autonomous agents that need to transact *now*, this is a hard blocker.

**Aegis deploys its own ERC-4337 paymaster contract** (`AegisPaymaster.sol`) and signs sponsorship approvals directly — no external dependency, no waiting.

### How it works

**Standard path (AEGIS delegation):**
```
Protocol registers → budget funded → agent approved
        ↓
canExecuteSponsorship() → { mode: 'LIVE' }   (immediate, no CDP)
        ↓
signPaymasterApproval() → 162-byte paymasterAndData
        ↓
UserOp.callData = execute(target, value, data)
        ↓
eth_sendUserOperation → Pimlico bundler → EntryPoint v0.7
        ↓
AegisPaymaster.validatePaymasterUserOp() verifies ECDSA sig on-chain
        ↓
Transaction confirmed — Basescan link returned
```

**MDF path (DeleGator account):**
```
User signs MDF Delegation struct (with Caveat[]) on DeleGator account
        ↓
POST /api/delegation/:id/mdf-upgrade → stored in DB
        ↓
Policy: 4 off-chain rules skipped (caveats enforce on-chain) + revocation RPC check
        ↓
UserOp.callData = DelegationManager.redeemDelegations([[delegation]], [mode], [execData])
        ↓
AegisPaymaster signs (calldata-agnostic — signs keccak256(callData) unchanged)
        ↓
Bundler submits → DelegationManager validates caveat chain → delegator executes
        ↓
Transaction confirmed — caveat + sponsorship events in same block
```

### End-to-End Demo

```bash
# Requires deployed AegisPaymaster + Pimlico RPC
AEGIS_PAYMASTER_ADDRESS=<deployed> \
AEGIS_PAYMASTER_SIGNING_KEY=<key> \
BUNDLER_RPC_URL=<pimlico-sepolia-url> \
SKIP_LEGITIMACY_CHECK=true \
RESERVE_THRESHOLD_ETH=0.01 \
npx tsx scripts/demo-e2e.ts

# Output:
# [Demo] Protocol created: demo-hackathon (budget: $50)
# [Demo] Agent approved: 0x1234... (tier 2, $10/day budget)
# [Demo] paymasterAndData: 162 bytes (expect 162)
# [Demo] Bundler OK — latency: 120ms, chainId: 84532
# [Demo] Submitting UserOperation to bundler...
#
# === SUCCESS ===
# [Demo] UserOp hash:  0xabc...
# [Demo] Tx hash:      0xdef...
# [Demo] Basescan:     https://sepolia.basescan.org/tx/0xdef...
```

### Deploy the Paymaster

```bash
# 1. Deploy to Base Sepolia
npm run deploy:paymaster
# Prints: AEGIS_PAYMASTER_ADDRESS=0x...

# 2. Fund the paymaster (deposits 0.05 ETH into EntryPoint v0.7)
npm run fund:paymaster

# 3. Add to .env
AEGIS_PAYMASTER_ADDRESS=<from step 1>
AEGIS_PAYMASTER_SIGNING_KEY=<your dedicated signer key>
BUNDLER_RPC_URL=https://api.pimlico.io/v2/84532/rpc?apikey=<key>
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AEGIS AGENT                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ OBSERVE  │───▶│  REASON  │───▶│  POLICY  │───▶│ EXECUTE  │  │
│  │          │    │          │    │          │    │          │  │
│  │ Blockchain│    │ LLM +    │    │ Safety   │    │ AgentKit │  │
│  │ State    │    │ Prompts  │    │ Rules    │    │ Wallet   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │                                               │         │
│       │              ┌──────────┐                     │         │
│       └─────────────▶│  MEMORY  │◀────────────────────┘         │
│                      │          │                               │
│                      │ Postgres │                               │
│                      │ Pinecone │                               │
│                      └──────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Observe**: Real-time blockchain state monitoring via viem
- **Reason**: LLM-powered decision making with structured outputs (GPT-4/Claude)
- **Policy**: 27+ configurable safety rules including 7 delegation-specific rules
- **Execute**: Dual-path execution — standard `execute(...)` or MDF `redeemDelegations(...)`
- **Memory**: Long-term learning with PostgreSQL + Pinecone vector search
- **x402 Integration**: Payment rails for agent-as-a-service
- **Sovereign Paymaster**: AegisPaymaster.sol — no CDP allowlist, no 5-7 day wait
- **MDF Integration**: MetaMask Delegation Framework — on-chain caveats as authorization layer
- **ERC-8004 Identity**: On-chain agent identity with tier-based prioritization
- **Execution Guarantees**: SLA-backed sponsorship (Bronze/Silver/Gold tiers)
- **Heartbeat**: Scheduled onchain liveness proofs for agent continuity

## Agent-First Execution Guarantees

Aegis implements strict **agent-first prioritization** to ensure AI agents with on-chain identity receive preferential treatment:

### Tier System
| Tier | Type | Priority | Description |
|------|------|----------|-------------|
| **1** | ERC-8004 Agents | HIGHEST | Registered AI agents with on-chain identity (Identity Registry) |
| **2** | ERC-4337 Accounts | STANDARD | Account abstraction smart wallets |
| **3** | Smart Contracts | FALLBACK | Other smart contracts |
| **0** | EOAs | **REJECTED** | Externally owned accounts - NEVER sponsored |

### Key Features
- **EOA Rejection**: Externally owned accounts are rejected at all entry points
- **Tier-Based Queue**: Tier 1 requests always processed before Tier 2/3
- **Gas Price Hardening**: MAX_GAS_PRICE_GWEI=2 (rejects UserOps >= 2 gwei)
- **OpenClaw Commands**: Natural language tier management via WhatsApp/Telegram
- **Real-Time Analytics**: Queue health monitoring and tier distribution tracking

### Verification
```bash
# Verify agent-first compliance
npx tsx scripts/verify-agent-first-compliance.ts

# Check tier distribution
npx tsx scripts/check-tier-distribution.ts

# Test gas price validation
npx tsx scripts/test-gas-price-validation.ts
```

See [docs/ops/agent-first-checklist.md](docs/ops/agent-first-checklist.md) for operational details.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16, React 19 |
| AI/LLM | OpenAI GPT-4, Anthropic Claude, LangChain, LangGraph |
| Blockchain | Coinbase AgentKit, viem, x402 |
| Database | PostgreSQL, Prisma ORM |
| Vector DB | Pinecone |
| Validation | Zod |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys for: OpenAI, Pinecone
- For LIVE sponsorship (no CDP required): deployed `AegisPaymaster.sol` + Pimlico bundler RPC

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aegis-agent.git
cd aegis-agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Prisma client is generated automatically on npm install (postinstall). If you pull schema changes without reinstalling, run: npm run db:generate

# Push database schema
npm run db:push
```

### Configuration

1. Copy `.env.example` to `.env`
2. Configure your API keys:
   - `OPENAI_API_KEY` - For LLM reasoning
   - `PINECONE_API_KEY` - For memory vector storage
   - `CDP_API_KEY_NAME` & `CDP_API_KEY_PRIVATE_KEY` - For AgentKit
   - `DATABASE_URL` - PostgreSQL connection string
   - `RPC_URL_*` - Blockchain RPC endpoints

### Running the Agent

```bash
# Development mode with hot reload
npm run agent:dev

# Run once
npm run agent:run

# Run the web dashboard
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
aegis-agent/
├── app/api/                    # Next.js API routes
│   ├── delegation/             # Delegation CRUD + MDF upgrade endpoint
│   ├── v1/                     # Protocol, guarantees, passport, sponsorship
│   └── agent/, protocol/, ...  # Other API routes
├── src/lib/
│   ├── agent/                  # Core agent logic
│   │   ├── observe/            # Blockchain state, oracles, DeFi, governance
│   │   ├── reason/             # LLM prompts, DecisionSchema
│   │   ├── policy/             # 27+ safety rules (sponsorship, delegation, reserve)
│   │   ├── execute/            # Paymaster, bundler, calldata, nonce, simulation
│   │   ├── guarantees/         # SLA-backed execution guarantees
│   │   ├── heartbeat/          # Onchain liveness monitoring
│   │   └── memory/             # Episodic store + Pinecone embeddings
│   ├── delegation/             # Delegation service, EIP-712, schemas
│   ├── mdf/                    # MetaMask Delegation Framework layer
│   │   ├── types.ts            # MdfCaveat, MdfDelegation interfaces
│   │   ├── constants.ts        # DelegationManager ABI + addresses
│   │   ├── caveats.ts          # Caveat builders from DelegationPermissions
│   │   ├── verifier.ts         # EIP-712 signature verification
│   │   ├── calldata.ts         # buildRedeemDelegationsCalldata()
│   │   └── index.ts            # Re-exports
│   ├── skills/                 # Skills executor (deterministic guards + LLM)
│   ├── protocol/               # Protocol onboarding, budget, policy config
│   └── auth/                   # Bearer token, API key, HMAC verification
├── contracts/                  # Solidity: ActivityLogger, AttestationLogger, etc.
├── prisma/schema.prisma        # Database schema
├── tests/                      # Vitest: 88 test files, 1031 tests
└── .env.example                # All 100+ env variables documented
```

## Agent Decision Flow

1. **Observe**: Gather current blockchain state (balances, gas prices, events)
2. **Retrieve Memories**: Query relevant past experiences from vector DB
3. **Reason**: LLM analyzes state and proposes action with confidence score
4. **Validate Policy**: Check decision against safety rules
5. **Execute**: If approved and confidence meets threshold, execute via AgentKit
6. **Store Memory**: Record decision and outcome for future learning

## Safety & Security

- **Policy Engine**: All decisions pass through configurable safety rules
- **Confidence Thresholds**: Actions require minimum confidence to execute
- **Execution Modes**: LIVE, SIMULATION, or READONLY
- **Smart Wallet**: AgentKit uses account abstraction with spending limits
- **LLM Isolation**: LLM never directly accesses private keys or constructs transactions

## MDF Integration — Three Trust Layers

The MetaMask Delegation Framework integration adds on-chain authorization as a third trust layer:

| Layer | What it enforces | When it runs |
|---|---|---|
| AI reasoning | Intent plausibility, context, confidence | Off-chain, every cycle |
| Policy engine (27+ rules) | Rate limits, budget, tier, gas price | Off-chain, every cycle |
| MDF caveats (on-chain) | Target contracts, functions, value caps, time windows | On-chain, every execution |

**Key invariant:** `AegisPaymaster.sol` required zero changes. It signs `keccak256(callData)` — calldata-agnostic. `redeemDelegations(...)` is just different calldata.

### MDF Delegation Flow

```bash
# 1. Create standard Aegis delegation
POST /api/delegation
{ "agentAddress": "0x...", "permissions": { "contracts": [...] }, ... }

# 2. Upgrade to MDF mode (user signs MDF Delegation struct on DeleGator account)
POST /api/delegation/:id/mdf-upgrade
{ "mdfDelegation": { "delegate": "0x...", "caveats": [...], "signature": "0x..." }, "chainId": 84532 }

# 3. All subsequent sponsorships for this delegation use redeemDelegations calldata
```

### Policy Rule Disposition (MDF vs AEGIS path)

| Rule | AEGIS path | MDF path |
|---|---|---|
| `delegation-exists-check` | DB check | Same |
| `delegation-scope-check` | Off-chain | Skipped → `AllowedTargetsEnforcer` on-chain |
| `delegation-value-check` | Off-chain | Skipped → `ValueLteEnforcer` on-chain |
| `delegation-expiry-check` | Off-chain | Skipped → `TimestampEnforcer` on-chain |
| `delegation-budget-check` | DB budget | Skipped → caveat/protocol budget |
| `delegation-rate-limit-check` | DB count | Kept — no MDF equivalent |
| `mdf-delegation-revocation-check` | N/A | New — `isDelegationDisabled()` RPC read |

## Future Roadmap

- [ ] MDF delegation chains (authority != ROOT — chained delegations)
- [ ] Caveat pre-flight simulation via `eth_call` before signing
- [ ] MDF delegator account type detection via on-chain interface check
- [ ] UI caveat builder in delegation dashboard
- [ ] Multi-agent coordination
- [ ] Advanced rebalancing strategies

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.
