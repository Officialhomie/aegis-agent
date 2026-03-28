# Aegis Strategic Positioning Document

**Version:** 1.0
**Last Updated:** February 2026
**Status:** Internal Strategy Document

---

## Executive Summary

Aegis is the trust and coordination layer that makes agent-to-protocol transactions reliable, policy-compliant, and economically guaranteed.

**Target Market:** NOT retail users. NOT end-user wallets.

**Primary Customers:**
- Agentic wallets
- Smart contract wallets (ERC-4337)
- Onchain agents executing transactions programmatically

**Core Value:** We compress months of infrastructure work into a single API call.

---

## Table of Contents

1. [Operating Models](#part-1--operating-models)
2. [Positioning in the Agent Economy](#part-2--positioning-in-the-agent-economy)
3. [Product Architecture](#part-3--product-architecture)
4. [Required Documents](#part-4--required-documents)
5. [Market Positioning Clarity](#part-5--market-positioning-clarity)
6. [Simple Explanation (Non-Technical)](#appendix-a--simple-explanation)
7. [User Interaction Guide](#appendix-b--user-interaction-guide)

---

## Part 1 — Operating Models

### Model A: Self-Serve Infrastructure (API-Based)

| Aspect | Description |
|--------|-------------|
| **Direct Customer** | Agent developers, wallet providers, protocol teams |
| **Onboarding** | Developer signs up, deposits USDC, gets API key |
| **Technical Flow** | Agent → POST /api/sponsor → Aegis validates → Signs UserOp → Returns to Agent |
| **Value Capture** | Basis points on sponsored gas (5-30 bps), Monthly SaaS fees |
| **Risks** | Commoditization, price pressure, no lock-in |
| **Verdict** | Table stakes. Necessary but not sufficient. |

### Model B: Managed Service / Underwriting Layer

| Aspect | Description |
|--------|-------------|
| **Direct Customer** | Protocols who want guaranteed agent execution |
| **Onboarding** | Protocol deposits treasury allocation, we manage everything |
| **Technical Flow** | Protocol deposits $50K → Aegis manages allocation → Approved agents execute |
| **Value Capture** | Management fee (10-20%), spread on optimization, execution guarantees |
| **Risks** | Capital requirements, counterparty risk, longer sales cycles |
| **Verdict** | Higher margin, higher moat, harder to scale initially. |

### Model C: Protocol-Integrated Middleware

| Aspect | Description |
|--------|-------------|
| **Direct Customer** | Protocols embedding us in their stack |
| **Onboarding** | Protocol integrates Aegis SDK, all agent interactions route through us |
| **Technical Flow** | Agent → Protocol Contract → Aegis Middleware → Execution |
| **Value Capture** | Per-transaction fees, revenue share, data layer access |
| **Risks** | Deep integration (good lock-in), protocol dependency |
| **Verdict** | Strongest lock-in, requires protocol-by-protocol BD. |

### Model D: Agent SDK Model

| Aspect | Description |
|--------|-------------|
| **Direct Customer** | Agent developers directly |
| **Onboarding** | Install `@aegis/agent-sdk`, SDK handles everything |
| **Technical Flow** | `agent.execute({ protocol, action, params })` - gas handled automatically |
| **Value Capture** | Per-execution fees, premium features (priority, MEV protection) |
| **Risks** | Two-sided marketplace problem, SDK adoption friction |
| **Verdict** | Highest ceiling, hardest cold start. |

### Model E: Hybrid Model (RECOMMENDED)

**Structure:**
1. **Foundation:** Self-serve API for agent developers (Model A)
2. **Growth:** Protocol partnerships with embedded middleware (Model C)
3. **Moat:** Execution guarantees + reputation layer (Model B economics)
4. **Scale:** Agent SDK once network effects establish (Model D)

**Phased Approach:**

| Phase | Timeline | Focus | Revenue Model |
|-------|----------|-------|---------------|
| 1 | 0-6 months | API for early agent devs | Usage fees |
| 2 | 6-18 months | Protocol integrations | Management fees + usage |
| 3 | 18-36 months | SDK + marketplace | Transaction fees + premiums |

---

## Part 2 — Positioning in the Agent Economy

### Stack Position

```
┌─────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                     │
│   Agent Orchestrators (AutoGPT, CrewAI, custom agents)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        WALLET LAYER                          │
│   Smart Wallets (Safe, Kernel, Biconomy, custom AA wallets) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ★ AEGIS LAYER ★                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Policy     │  │  Reputation  │  │  Execution   │       │
│  │  Enforcement │  │    Engine    │  │  Guarantees  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    Budget    │  │    Risk      │  │   Priority   │       │
│  │  Management  │  │  Monitoring  │  │   Routing    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PAYMASTER LAYER                         │
│   Bundlers (Pimlico, Alchemy, Stackup, CDP)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PROTOCOL LAYER                          │
│   DeFi, NFT, Gaming, Social protocols                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        CHAIN LAYER                           │
│   Base, Ethereum, Arbitrum, Optimism, etc.                  │
└─────────────────────────────────────────────────────────────┘
```

### We Are NOT "Just a Paymaster"

| Capability | Paymaster | Aegis |
|------------|-----------|-------|
| Gas payment | ✓ | ✓ |
| Policy enforcement | ✗ | ✓ (27+ rules) |
| Agent reputation | ✗ | ✓ (Trust Score 0-1000) |
| Budget management | ✗ | ✓ (Per-protocol, per-agent) |
| Execution guarantees | ✗ | ✓ (SLA-backed tiers) |
| Cross-protocol coordination | ✗ | ✓ |
| Risk monitoring | ✗ | ✓ (Circuit breakers, anomaly detection) |
| Conversational management | ✗ | ✓ (OpenClaw) |

**Paymasters are dumb pipes. Aegis is intelligent infrastructure.**

### What We Are (Precisely)

We are the coordination and trust layer between agents and protocols.

| Layer Type | What It Means |
|------------|---------------|
| **Infrastructure** | We provide the pipes (API, SDK, paymaster integration) |
| **Coordination** | We route agents to protocols efficiently |
| **Execution Guarantee** | We underwrite transaction success |
| **Reputation** | We score agent trustworthiness |
| **Economic Primitive** | We enable new business models (gas-as-a-service, SLAs) |

**Layered Architecture:**

```
         ┌─────────────────────────┐
         │   Economic Primitive    │  ← Enables new business models
         ├─────────────────────────┤
         │   Reputation Layer      │  ← Trust scoring, risk assessment
         ├─────────────────────────┤
         │ Execution Guarantee     │  ← SLAs, refunds, priority
         ├─────────────────────────┤
         │   Coordination Layer    │  ← Policy, routing, optimization
         ├─────────────────────────┤
         │   Infrastructure Layer  │  ← API, SDK, paymaster integration
         └─────────────────────────┘
```

### Why Agentic Wallets Need Us

**Without Aegis:**
- Agent must hold ETH for gas (capital inefficient)
- Agent must estimate gas (error-prone)
- Agent must handle failures (retry logic, stuck transactions)
- Agent must be trusted by each protocol individually
- Agent has no portable reputation

**With Aegis:**
- Zero gas management - we handle everything
- Execution guarantees - transactions succeed or we refund
- Portable reputation - prove trustworthiness across protocols
- Policy compliance - automatic adherence to protocol rules
- Budget optimization - we find the cheapest execution path

**The agent developer's calculus:**

| Option | Effort | Risk |
|--------|--------|------|
| Build gas management yourself | 2-4 weeks engineering | Unpredictable failures |
| Integrate Aegis | 30 minutes | Fixed fee per transaction |

### Why Protocols Integrate Us

**Without Aegis:**
- Must build their own agent allowlist
- Must manage gas budgets manually
- Must handle abuse/fraud themselves
- Must trust each agent individually
- No visibility into agent behavior

**With Aegis:**
- Pre-vetted agents with reputation scores
- Managed gas budgets with real-time controls
- Fraud detection and circuit breakers built-in
- Policy enforcement without smart contract changes
- Full analytics and conversational management

**The protocol's calculus:**

| Option | Effort | Risk |
|--------|--------|------|
| Build agent management | 3-6 months + maintenance | Catastrophic rogue agent risk |
| Integrate Aegis | 1 week | Underwritten by Aegis |

### Why We Remain Valuable Even If Coinbase Sponsors Gas

Coinbase sponsoring gas is commodity infrastructure. They provide:
- Gas payment
- Basic rate limiting
- Maybe some analytics

**They do NOT provide:**
- Cross-protocol reputation
- Intelligent policy enforcement
- Execution guarantees with SLAs
- Agent-specific risk assessment
- Protocol-side management tools
- Economic coordination between agents and protocols

**Analogy:**
- Coinbase sponsoring gas = AWS providing compute
- Aegis = Stripe providing payments

**Our value is orthogonal to who pays for gas.**

---

## Part 3 — Product Architecture

### System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      AEGIS ARCHITECTURE                         │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    INGRESS LAYER                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │   REST API  │  │   SDK       │  │  Webhooks   │       │  │
│  │  │  /sponsor   │  │  @aegis/sdk │  │  Callbacks  │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  ORCHESTRATION LAYER                      │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │                   ORCHESTRATOR                       │ │  │
│  │  │  - Request validation                                │ │  │
│  │  │  - Context enrichment (reputation, policy)           │ │  │
│  │  │  - Decision routing                                  │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                              │                            │  │
│  │         ┌────────────────────┼────────────────────┐      │  │
│  │         ▼                    ▼                    ▼      │  │
│  │  ┌───────────┐        ┌───────────┐        ┌───────────┐│  │
│  │  │  POLICY   │        │ REPUTATION│        │   RISK    ││  │
│  │  │  ENGINE   │        │  ENGINE   │        │  ENGINE   ││  │
│  │  │           │        │           │        │           ││  │
│  │  │ 27+ rules │        │ Passport  │        │ Circuit   ││  │
│  │  │ Runtime   │        │ Trust 0-  │        │ breakers  ││  │
│  │  │ overrides │        │ 1000      │        │ Anomaly   ││  │
│  │  └───────────┘        └───────────┘        └───────────┘│  │
│  │                              │                            │  │
│  └──────────────────────────────┼────────────────────────────┘  │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   DECISION LAYER                          │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │                   DISPATCHER                         │ │  │
│  │  │  - Approve / Reject / Defer                          │ │  │
│  │  │  - Tier-based routing (Bronze/Silver/Gold)           │ │  │
│  │  │  - Priority queuing                                  │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                              │                            │  │
│  └──────────────────────────────┼────────────────────────────┘  │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   EXECUTION LAYER                         │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │                    EXECUTOR                          │ │  │
│  │  │  - Paymaster signing                                 │ │  │
│  │  │  - Bundler submission                                │ │  │
│  │  │  - SLA tracking                                      │ │  │
│  │  │  - Retry / fallback logic                            │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                            │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐            │  │
│  │  │   CDP     │  │  Pimlico  │  │  Alchemy  │   ...      │  │
│  │  │ Paymaster │  │  Bundler  │  │  Bundler  │            │  │
│  │  └───────────┘  └───────────┘  └───────────┘            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   SETTLEMENT LAYER                        │  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │   Budget    │  │   Billing   │  │   Refunds   │       │  │
│  │  │  Tracking   │  │   Engine    │  │   (SLA)     │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├────────────────────────────────────────────────────────────────┤
│                      SUPPORTING SYSTEMS                          │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ OpenClaw  │  │ Analytics │  │  Alerts   │  │   Logs    │   │
│  │ (Comms)   │  │ Dashboard │  │  System   │  │ (Audit)   │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Gas Sponsorship Flow

```typescript
// 1. Agent submits sponsorship request
POST /api/v1/sponsor
{
  userOp: {
    sender: "0x...",      // Agent's smart wallet
    callData: "0x...",    // Transaction to execute
    nonce: 42,
    // ... other UserOp fields
  },
  protocolId: "uniswap",
  agentId: "0x...",       // Agent's identifier
  priority: "gold",       // Optional: service tier
  metadata: {
    actionType: "swap",
    expectedValue: 1000   // USD value of transaction
  }
}

// 2. Orchestrator enriches context
context = {
  agent: await getAgentPassport(agentId),
  protocol: await getProtocol(protocolId),
  request: parseUserOp(userOp),
  market: await getGasMarket(),
}

// 3. Policy Engine evaluates (27+ rules)
// 4. Risk Engine assesses (circuit breakers, anomalies)
// 5. Dispatcher routes (approve/reject/defer)
// 6. Executor submits to bundler
// 7. Settlement records transaction
```

### Policy Enforcement

**Rule Categories:**

| Category | Rules | Example |
|----------|-------|---------|
| **Budget** | Daily limits, per-tx limits, total limits | "Max $500/day for this agent" |
| **Gas** | Price caps, priority fee limits | "Only sponsor if gas < 50 gwei" |
| **Agent** | Reputation thresholds, blocklists | "Require trust score > 500" |
| **Protocol** | Whitelisted contracts, method restrictions | "Only swap() and transfer()" |
| **Temporal** | Time-of-day, rate limits | "Max 10 tx/minute" |
| **Value** | Transaction size limits | "Max $10K single transaction" |

**Evaluation Order:**

1. Protocol status (is protocol active?)
2. Agent blocklist (is agent blocked?)
3. Budget constraints (is there budget?)
4. Runtime overrides (any pauses or limits?)
5. Gas price rules (is gas acceptable?)
6. Rate limits (is agent within limits?)
7. Reputation rules (does agent meet threshold?)
8. Contract rules (is target allowed?)
9. Value rules (is amount acceptable?)
10. Risk assessment (any anomalies?)

**Policy Precedence:**

```
Execution Guarantees (highest)
    ↓
Runtime Overrides (OpenClaw commands)
    ↓
Protocol Policy Config
    ↓
Default Environment Config (lowest)
```

### Risk Management

**Circuit Breakers:**

| Breaker | Trigger | Action |
|---------|---------|--------|
| Budget Exhaustion | Protocol < 10% budget | Pause new sponsorships |
| High Failure Rate | > 20% failures in 1 hour | Alert + reduce limits |
| Anomaly Detection | 10x normal volume | Manual review required |
| Gas Spike | Gas > 5x average | Pause non-Gold tier |
| Agent Velocity | 100x normal for agent | Block agent temporarily |

### Reputation Layer (Gas Passport)

```typescript
interface GasPassport {
  walletAddress: string;

  // Tier classification
  tier: 'NEWCOMER' | 'ACTIVE' | 'TRUSTED' | 'PREMIUM' | 'WHALE' | 'FLAGGED';
  trustScore: number;  // 0-1000
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  // Activity metrics
  activity: {
    sponsorshipCount: number;
    successRateBps: number;
    protocolCount: number;
    totalValueSponsoredUSD: number;
  };

  // Behavioral patterns
  behavior: {
    avgSponsorshipsPerWeek: number;
    consistencyScore: number;
    recencyDays: number;
  };

  // External signals
  identity: {
    ensName: string | null;
    farcasterFid: number | null;
    onChainTxCount: number | null;
  };
}
```

### Execution Guarantees (SLA Model)

| Tier | SLA | Premium | Guarantee |
|------|-----|---------|-----------|
| **BRONZE** | Best effort | 0% | None |
| **SILVER** | 95% within 5 min | 15% | Pro-rata refund |
| **GOLD** | 99% within 2 min | 30% | Full refund + credit |

---

## Part 4 — Required Documents

### 1. Vision Document

| Aspect | Details |
|--------|---------|
| **Purpose** | Align team, investors, and partners on direction |
| **Audience** | Everyone (internal, investors, strategic partners) |
| **Key Sections** | The Problem, The Opportunity, Our Solution, Why Now, Why Us, 5-Year Vision |

### 2. Technical Architecture Document

| Aspect | Details |
|--------|---------|
| **Purpose** | Guide engineering implementation |
| **Audience** | Engineering team, technical due diligence |
| **Key Sections** | System Overview, Component Specs, Data Models, Integration Points, Scalability, Security, DR |

### 3. Revenue Model / Tokenomics

| Aspect | Details |
|--------|---------|
| **Purpose** | Define how we capture value |
| **Audience** | Finance, investors, business development |
| **Key Sections** | Revenue Streams, Pricing Strategy, Unit Economics, Growth Projections, Token Design, Treasury |

### 4. Risk Framework

| Aspect | Details |
|--------|---------|
| **Purpose** | Identify and mitigate risks |
| **Audience** | Operations, compliance, investors |
| **Key Sections** | Operational Risks, Financial Risks, Technical Risks, Regulatory Risks, Market Risks, Mitigations |

### 5. API Specification

| Aspect | Details |
|--------|---------|
| **Purpose** | Enable developer integration |
| **Audience** | External developers, agent builders |
| **Key Sections** | Authentication, Endpoints, Schemas (OpenAPI), Error Codes, Rate Limits, Webhooks, SDK Docs |

### 6. GTM Positioning Document

| Aspect | Details |
|--------|---------|
| **Purpose** | Guide marketing and sales |
| **Audience** | Marketing, sales, partnerships |
| **Key Sections** | Target Segments, Value Props, Competitive Positioning, Messaging, Channel Strategy, Launch Plan |

### 7. Competitive Analysis

| Aspect | Details |
|--------|---------|
| **Purpose** | Understand the landscape |
| **Audience** | Strategy, product, investors |
| **Key Sections** | Direct Competitors, Adjacent Players, Comparison Matrix, Competitive Moats, Positioning Map |

### 8. Partner Integration Guide

| Aspect | Details |
|--------|---------|
| **Purpose** | Enable protocol partnerships |
| **Audience** | Protocol teams, BD counterparts |
| **Key Sections** | Integration Overview, Technical Steps, Policy Config, Budget Management, Support & SLAs, Case Studies |

### 9. Developer Onboarding Guide

| Aspect | Details |
|--------|---------|
| **Purpose** | Get developers to first transaction |
| **Audience** | Agent developers |
| **Key Sections** | Quickstart, Auth Setup, First Transaction, Policy Config, Error Handling, Testing, Production Checklist |

### 10. Execution Guarantees Specification

| Aspect | Details |
|--------|---------|
| **Purpose** | Define SLA product |
| **Audience** | Enterprise customers, legal, operations |
| **Key Sections** | Service Tiers, SLA Terms, Measurement, Refund Policies, Exclusions, Pricing, Escalation |

---

## Part 5 — Market Positioning Clarity

### In One Sentence: What Are We?

**Aegis is the trust and coordination layer that makes agent-to-protocol transactions reliable, policy-compliant, and economically guaranteed.**

### Why Do Agentic Wallets Need Us?

Agentic wallets execute transactions programmatically across dozens of protocols, but each execution requires gas, policy compliance, and trust establishment. Without Aegis, agent developers must build gas management (acquiring, estimating, retrying), implement policy compliance per-protocol, establish trust with each protocol individually, and handle failures gracefully - weeks of engineering that distracts from their core product. With Aegis, agents get gas-free execution, automatic policy compliance, portable reputation that works across all Aegis-enabled protocols, and execution guarantees with SLA-backed refunds if transactions fail. We compress months of infrastructure work into a single API call.

### Why Is This Valuable Even If Coinbase Sponsors Gas?

Free gas from Coinbase or any large provider solves the payment problem, not the trust and coordination problem. When gas is free, protocols face a new challenge: how do they manage which agents can execute, what actions are allowed, what budgets apply, and what happens when things go wrong? Aegis provides the intelligence layer above raw gas sponsorship - policy enforcement that prevents unauthorized actions, reputation scoring that identifies trustworthy agents, execution guarantees that refund protocols when SLAs are breached, and conversational management that lets protocol teams control everything via WhatsApp. Even in a world of free gas, someone must decide who gets the gas, under what conditions, and with what guarantees. That someone is Aegis.

---

## Appendix A — Simple Explanation

### What is Aegis? (Non-Technical Version)

**The Problem:**

When software agents (AI bots, automated systems) want to do things on the blockchain, they face three problems:

1. **Gas fees** - Every action costs money (like postage for every letter)
2. **Trust** - How does a protocol know this agent is safe?
3. **Management** - How do you control what agents can do?

**The Solution:**

Aegis is like a corporate credit card for agents.

- **The company (protocol)** opens an account with us
- **They set rules** about what their agents can spend on
- **Agents use our "card"** to pay for transactions
- **We track everything** and make sure rules are followed

**Real-World Analogy:**

| Traditional | Aegis |
|-------------|-------|
| Employee expense card | Agent gas sponsorship |
| Spending limits | Budget controls |
| Category restrictions | Policy rules |
| Credit score | Gas Passport (reputation) |
| Expense reports | Analytics dashboard |

### The Three Players

**1. Protocols (Companies Building Apps)**
- They have agents that need to execute transactions
- They want control over spending and behavior
- They don't want to build this infrastructure themselves

**2. Agents (Automated Software)**
- They execute transactions on behalf of users or protocols
- They need gas to operate
- They want to prove they're trustworthy

**3. Aegis (The Infrastructure)**
- We sit in the middle
- We provide the gas (or coordinate it)
- We enforce the rules
- We track reputation

---

## Appendix B — User Interaction Guide

### For Protocol Managers (Primary Users)

Protocol managers interact through **OpenClaw** - a messaging gateway (WhatsApp, Telegram, Signal).

**Authentication:**
1. Register protocol with Aegis
2. Link messaging account to protocol
3. Verify ownership

**Daily Commands:**

| Command | What It Does |
|---------|--------------|
| `status` | See current budget, spending, health |
| `pause` | Stop all sponsorships |
| `pause for 2 hours` | Temporary pause |
| `resume` | Restart sponsorships |
| `show top 10 users` | Analytics on highest spenders |
| `block 0x123...` | Block a specific wallet |
| `set daily limit to $500` | Update spending cap |
| `set max gas to 50 gwei` | Control gas price ceiling |
| `passport 0x123...` | Check an agent's reputation |

**Example Conversation:**

```
Manager: status
Aegis:   Protocol: TradingBot
         Status: Active
         Budget: $2,450 / $5,000 (49% used)
         Sponsored: 1,234 transactions today
         Success Rate: 98.2%
         Top Agent: 0x742d...f832 ($456.12)

Manager: show top 10 users this week
Aegis:   Top agents by gas spend (7 days):
         1. 0x742d...f832 - $1,234.56 (890 txs)
         2. 0x1234...abcd - $987.23 (654 txs)
         3. 0xabcd...1234 - $543.21 (321 txs)
         ...

Manager: block 0x742d...f832
Aegis:   Wallet 0x742d...f832 blocked.
         Future sponsorships will be rejected.
         Reason: Blocked via OpenClaw

Manager: passport 0x1234...abcd
Aegis:   GAS PASSPORT
         Wallet: 0x1234...abcd
         Tier: TRUSTED
         Trust Score: 782/1000
         Risk Level: LOW

         Activity: 654 sponsorships, 99.1% success
         Value: $987.23 total, top 15%
         Identity: ENS: trader.eth, Farcaster: @trader
```

### For Agent Developers (Technical Users)

Agent developers interact through the **API**.

**Integration Steps:**

1. Register for API key
2. Install SDK or use REST API directly
3. Configure agent with API key
4. Submit sponsorship requests

**API Example:**

```typescript
// Using SDK
import { AegisClient } from '@aegis/sdk';

const aegis = new AegisClient({ apiKey: 'your-api-key' });

// Submit sponsorship request
const result = await aegis.sponsor({
  userOp: signedUserOperation,
  protocolId: 'your-protocol',
  priority: 'silver'
});

// Result includes:
// - transactionHash
// - sponsorshipId
// - actualCostUSD
// - slaCompliant (for Silver/Gold)
```

**REST API:**

```bash
POST /api/v1/sponsor
Authorization: Bearer your-api-key

{
  "userOp": { ... },
  "protocolId": "your-protocol",
  "priority": "silver"
}
```

### For End Users (Indirect)

End users do NOT interact with Aegis directly. The experience is invisible.

They:
1. Use an app powered by Aegis
2. Perform actions (trade, mint, transfer)
3. Actions succeed without gas prompts

Behind the scenes, Aegis handles everything.

---

## Appendix C — Success Metrics

### If We Succeed, We Become:

| Achievement | Position |
|-------------|----------|
| API adoption | The Stripe of agent execution |
| Protocol integration | Default middleware for agent-enabled protocols |
| SDK adoption | The AWS for agent developers |
| Reputation layer | The credit bureau of onchain agents |
| SLA product | The enterprise tier for serious players |

### Key Performance Indicators:

| Metric | Target |
|--------|--------|
| Monthly sponsored transactions | 1M+ |
| Protocols integrated | 50+ |
| Active agents | 10,000+ |
| SLA compliance (Gold) | >99% |
| Average trust score (network) | >600 |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | Aegis Team | Initial strategic positioning |

---

*This document is confidential and intended for internal use and authorized partners only.*
