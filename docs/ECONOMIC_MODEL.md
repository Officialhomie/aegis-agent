# Aegis Economic Model & Business Logic

**Version**: 1.0
**Date**: February 2, 2026
**Status**: Pre-Launch Economic Framework

---

## Executive Summary

Aegis operates as autonomous gas reliability infrastructure for the Base agent economy, generating revenue through protocol-funded sponsorships while maintaining a sustainable 30% profit margin per transaction. The business model is built on three pillars:

1. **Protocol Sponsorship Model**: Protocols pre-fund budgets to sponsor their autonomous agents
2. **x402 Payment Rails**: Agent-to-agent payment coordination for gas sponsorships
3. **Autonomous Reserve Management**: Self-sustaining ETH/USDC treasury operations

**Target Economics** (Base Sepolia → Base Mainnet):
- Revenue per sponsorship: $0.10 (x402 payment)
- Cost per sponsorship: $0.07 (gas + overhead)
- **Net margin**: 30% ($0.03 profit per tx)
- Break-even: ~3,000 sponsorships/month
- Target: 10,000 sponsorships/month ($300 monthly profit)

---

## 1. Revenue Model

### 1.1 Primary Revenue: Protocol Sponsorships

**How It Works**:
1. Protocol deposits USDC into their sponsorship budget (e.g., $500)
2. Aegis sponsors gas for protocol's autonomous agents (trading bots, DAO executors, etc.)
3. Aegis charges $0.10 per sponsorship via x402 payment proof
4. Protocol's budget decrements with each sponsorship

**Revenue Per Sponsorship** (Base Mainnet, Feb 2026):
```
Gas Cost Breakdown:
- Base gas price: 0.05 Gwei (avg)
- Gas limit per tx: 200,000
- ETH cost: 0.05 Gwei × 200,000 = 0.01 Gwei = 0.00001 ETH
- ETH price: $2,800
- Gas cost in USD: 0.00001 ETH × $2,800 = $0.028

Aegis Pricing:
- Gas cost: $0.028
- Overhead (20%): $0.006
- Infrastructure margin (25%): $0.007
- Risk buffer (10%): $0.003
- Profit margin (30%): $0.056
────────────────────────────
Total charge: $0.10 per sponsorship

Profit: $0.10 - $0.07 (actual cost) = $0.03 (30% margin)
```

**Protocol Sponsorship Tiers**:

| Tier | Monthly Budget | Sponsorships/Month | Monthly Fee | Benefits |
|------|---------------|-------------------|-------------|----------|
| **Bronze** | $50 | 500 | $50 | Basic sponsorship, 1 protocol contract |
| **Silver** | $200 | 2,000 | $200 | Priority queue, 3 protocol contracts |
| **Gold** | $500 | 5,000 | $500 | Fastest sponsorship, 10 contracts, analytics dashboard |
| **Enterprise** | Custom | Unlimited | Custom | Dedicated support, SLA guarantees, custom rules |

### 1.2 Secondary Revenue Streams (Future)

**Premium Features** (Post-Launch):
- **Analytics Dashboard API**: $50/month per protocol for detailed metrics
- **Custom Policy Rules**: $100/month for protocol-specific eligibility logic
- **Priority Sponsorship**: +$0.02/tx for sub-5s sponsorship guarantee
- **Multi-Chain Support**: +$0.03/tx for Optimism, Arbitrum, etc.

**Estimated Revenue Mix** (Year 1):
- Protocol sponsorships: 85% ($25,500/month @ 10k txs)
- Premium analytics: 10% ($3,000/month @ 60 protocols)
- Custom features: 5% ($1,500/month @ 15 custom protocols)
- **Total**: ~$30,000/month

---

## 2. Cost Structure

### 2.1 Direct Costs (Per Sponsorship)

**Gas Costs** (Base Mainnet):
```typescript
// AegisActivityLogger.logSponsorship() gas usage
Gas Breakdown:
- Contract call: ~45,000 gas
- Base gas price: 0.05 Gwei
- ETH cost: 45,000 × 0.05 Gwei = 0.00000225 ETH
- USD cost: 0.00000225 ETH × $2,800 = $0.0063

// Sponsored agent transaction (not paid by Aegis, but reserved)
Agent Gas Sponsorship:
- Agent tx gas: ~200,000 gas
- Base gas price: 0.05 Gwei
- ETH cost: 200,000 × 0.05 Gwei = 0.00001 ETH
- USD cost: 0.00001 ETH × $2,800 = $0.028

Total Direct Cost per Sponsorship:
- Aegis logging: $0.0063
- Agent tx (covered by protocol payment): $0.028
────────────────────────────
Total: $0.0343 (rounded to $0.035)
```

**Bundler/Paymaster Costs** (Pimlico/Alchemy):
- Bundler fee: $0.005 per UserOp
- Paymaster signature verification: $0.002
- **Subtotal**: $0.007/tx

**Infrastructure Overhead**:
- API calls (Blockscout, Neynar, Pinata): $0.003/tx
- Database writes (Postgres, Redis): $0.001/tx
- LLM reasoning (GPT-4/Claude): $0.008/tx
- **Subtotal**: $0.012/tx

**Total Cost per Sponsorship**:
```
Gas costs:        $0.035
Bundler fees:     $0.007
Infrastructure:   $0.012
Risk reserve:     $0.016 (20% buffer for failed txs, disputes)
────────────────────────────
Total Cost:       $0.070
```

### 2.2 Fixed Operational Costs (Monthly)

**Infrastructure**:
| Service | Provider | Monthly Cost |
|---------|----------|--------------|
| Base RPC (100M calls/month) | Alchemy/Infura | $200 |
| Postgres DB (10GB, high availability) | Render/Railway | $25 |
| Redis State Store (2GB) | Upstash | $10 |
| IPFS Pinning (50GB) | Pinata | $20 |
| Farcaster API (Neynar) | Neynar | $50 |
| Blockscout API (abuse detection) | Blockscout | $0 (free tier) |
| LLM API (GPT-4/Claude) | OpenAI/Anthropic | $150 |
| Monitoring (Sentry, DataDog) | Sentry | $29 |
| **Total Fixed Costs** | | **$484/month** |

**Operational Reserve**:
- ETH reserve (1 ETH @ $2,800): $2,800 (one-time)
- USDC working capital (500 USDC): $500 (one-time)
- Emergency fund (10% of monthly revenue): ~$300/month

**Total Monthly Fixed Costs**: ~$484 + $300 = **$784/month**

---

## 3. Protocol Sponsorship Economics

### 3.1 Value Proposition for Protocols

**Why Protocols Pay Aegis**:

1. **Developer Experience**: Eliminates gas management from agent code
2. **Reliability**: Agents never stall due to gas depletion
3. **Compliance**: Autonomous sponsorship decisions logged on-chain
4. **Scalability**: Supports thousands of agents without manual intervention

**Cost Comparison** (Protocol Perspective):

| Approach | Monthly Cost (1,000 txs) | Developer Overhead | Reliability |
|----------|-------------------------|-------------------|-------------|
| **Manual Top-Ups** | $50 (gas only) | High (manual monitoring) | Low (downtime risk) |
| **Protocol-Owned Relayer** | $80 (gas + infra) | Very High (custom logic) | Medium (maintenance) |
| **Aegis Sponsorship** | $100 ($0.10/tx) | Zero (autonomous) | High (99.9% uptime) |

**ROI for Protocols**:
- Saves 10-20 dev hours/month (gas management, monitoring, debugging)
- Dev cost: $100/hour × 15 hours = $1,500/month
- Aegis cost: $100/month
- **Net savings**: $1,400/month (14x ROI)

### 3.2 Protocol Onboarding Flow

**Step 1: Budget Deposit** (Prisma `ProtocolSponsor` table)
```typescript
// Protocol deposits $500 USDC
await db.protocolSponsor.create({
  data: {
    protocolId: 'protocol-xyz',
    name: 'DeFi Protocol XYZ',
    balanceUSD: 500,
    totalSpent: 0,
    sponsorshipCount: 0,
    whitelistedContracts: ['0xProtocolContract1', '0xProtocolContract2'],
    tier: 'gold', // 5,000 txs/month
  },
});
```

**Step 2: Agent Registration**
- Protocol submits agent wallet addresses + target contracts
- Aegis validates onchain history (min 5 txs, no abuse flags)
- Agents approved if historicalTxs >= 5

**Step 3: Autonomous Sponsorship**
- Agent runs low on ETH (< 0.001 ETH)
- Agent sends x402 payment proof to Aegis
- Aegis sponsors next UserOp if policy passes
- Protocol budget decrements by $0.10

**Step 4: Budget Monitoring**
- Alert when budget < 20% (e.g., $100 remaining)
- Auto-alert via ALERT_PROTOCOL action + Farcaster notification
- Protocol can top-up via USDC transfer to Aegis treasury

### 3.3 Protocol Budget Depletion Policy

**Budget Alerts**:
- 50% remaining: Informational alert (Farcaster + optional webhook)
- 20% remaining: Warning alert (recommend top-up within 7 days)
- 10% remaining: Critical alert (sponsorships will stop in ~1-2 days)
- 0% remaining: **Sponsorship paused** until top-up

**Grace Period**:
- 24-hour grace period after budget hits $0
- Aegis covers up to 10 emergency sponsorships ($1 total) to prevent hard stops
- Protocol notified via email + Farcaster + webhook

**Auto Top-Up** (Future Feature):
- Protocol can enable auto-refill when budget < 20%
- USDC pulled from protocol's treasury multisig
- Requires smart contract integration (ERC-4337 batch call)

---

## 4. Reserve Management Economics

### 4.1 Aegis Treasury Composition

**Target Reserve Balance**:
```
ETH Reserve:
- Purpose: Cover gas costs for sponsorships
- Target: 1 ETH (~$2,800)
- Min threshold: 0.1 ETH (~$280)
- Max threshold: 2 ETH (~$5,600)

USDC Working Capital:
- Purpose: Swap to ETH when reserves low
- Target: 500 USDC
- Min threshold: 100 USDC
- Max threshold: 2,000 USDC

Protocol Revenue (USDC):
- Purpose: Accumulated sponsorship fees
- Stored in: Aegis treasury multisig (Gnosis Safe)
- Withdrawal schedule: Monthly to operational wallet
```

### 4.2 Automatic Reserve Rebalancing

**SWAP_RESERVES Trigger Logic**:
```typescript
// Triggered when ETH < 0.1 and USDC > 100
if (agentReservesETH < 0.1 && agentReservesUSDC > 100) {
  const swapAmount = Math.min(
    (0.5 - agentReservesETH) * ethPrice, // Restore to 0.5 ETH
    agentReservesUSDC - 100 // Keep 100 USDC buffer
  );

  return {
    action: 'SWAP_RESERVES',
    confidence: 0.85,
    reasoning: `ETH ${agentReservesETH.toFixed(2)} below threshold; swapping ${swapAmount} USDC to ETH`,
    parameters: {
      tokenIn: 'USDC',
      tokenOut: 'ETH',
      amountIn: swapAmount.toString(),
      slippageTolerance: 0.005, // 0.5% max slippage
    },
  };
}
```

**Swap Economics** (Uniswap V3 on Base):
- Swap fee (0.05% pool): 0.05% of swap amount
- Gas cost: ~100,000 gas = 0.000005 ETH = $0.014
- Slippage protection: Max 0.5% deviation
- **Total swap cost**: ~0.5% + $0.014

**Example Swap**:
```
Scenario: ETH drops to 0.05, USDC balance = 500
Target: Restore ETH to 0.5

Swap calculation:
- ETH needed: 0.5 - 0.05 = 0.45 ETH
- USDC cost: 0.45 ETH × $2,800 = $1,260
- Available USDC: 500
- Actual swap: min($1,260, 500 - 100) = $400
- ETH acquired: $400 / $2,800 = 0.143 ETH
- New ETH balance: 0.05 + 0.143 = 0.193 ETH ✅ (above 0.1 threshold)
```

### 4.3 Revenue Distribution

**Monthly Revenue Allocation**:
```
Gross Revenue (10,000 txs @ $0.10):  $1,000

Costs:
- Gas costs (10,000 × $0.035):        -$350
- Bundler fees (10,000 × $0.007):     -$70
- Infrastructure (10,000 × $0.012):   -$120
- Fixed operational costs:             -$484
────────────────────────────────────────────
Net Profit:                            $976

Allocation:
- Reserve replenishment (20%):         $195
- Operational buffer (10%):            $98
- Development fund (30%):              $293
- Treasury (40%):                      $390
────────────────────────────────────────────
Total:                                 $976
```

---

## 5. Risk Mitigation & Abuse Prevention

### 5.1 Economic Attack Vectors

**Attack 1: Sybil Sponsorship Farming**
- **Threat**: Create 1,000 fake agents, request sponsorships, drain protocol budgets
- **Mitigation**:
  - Min 5 historical txs on Base (costs ~$0.14 to acquire)
  - Max 3 sponsorships/day per agent ($0.30/day revenue)
  - Sybil attack cost: 1,000 agents × $0.14 = $140
  - Max revenue: 1,000 agents × $0.30 = $300/day
  - **ROI**: 2.1x (break-even in 0.5 days)
- **Enhanced Mitigation**:
  - Increase min txs to 10 (cost: $0.28/agent)
  - Add 7-day aging requirement (Sybil farms detectable)
  - Blockscout dust spam detection (80% dust txs = abuse)
  - **New ROI**: 1.07x (break-even in 13 days, easier to detect)

**Attack 2: Gas Price Manipulation**
- **Threat**: Submit txs during gas spikes, inflate sponsorship costs
- **Mitigation**:
  - Gas price cap: 2 Gwei (reject sponsorships above)
  - Real-time gas oracle (Chainlink or Base RPC)
  - Sponsor only when gasPrice < 2 Gwei
- **Result**: Aegis pauses sponsorships during spikes, no economic loss

**Attack 3: Protocol Budget Draining**
- **Threat**: Malicious actor registers as "protocol", drains own budget, claims free sponsorships
- **Mitigation**:
  - Protocol onboarding requires smart contract verification
  - Whitelist protocol contracts (only known DeFi protocols)
  - Manual KYC for budgets > $1,000
  - Community multisig for protocol approvals (3-of-5)

**Attack 4: Failed Transaction Griefing**
- **Threat**: Submit txs that always revert, waste Aegis gas on logging
- **Mitigation**:
  - Aegis only logs SPONSOR decision, not agent tx execution
  - Agent tx failure doesn't cost Aegis (paymaster fee refunded if tx reverts)
  - Max 3 failed txs/day per agent before suspension

### 5.2 Economic Safety Mechanisms

**Circuit Breakers**:
```typescript
// Implemented in src/lib/agent/execute/circuit-breaker.ts
const circuitBreaker = {
  // Global sponsorship rate limit
  maxSponsorshipsPerMinute: 10, // Prevent spam attacks

  // Per-protocol budget protection
  maxProtocolSpendPerDay: (budget) => budget * 0.2, // Max 20% daily burn

  // Reserve protection
  minETHReserve: 0.05, // Pause sponsorships if ETH < 0.05
  minUSDCReserve: 50, // Alert if USDC < 50

  // Gas price protection
  maxGasPrice: 2, // Gwei (Base avg: 0.05 Gwei, spike: 5 Gwei)
};
```

**Emergency Shutdown Conditions**:
1. ETH reserve < 0.01 ETH → Pause all sponsorships
2. >50% of sponsorships fail within 1 hour → Pause + investigate
3. Gas price >10 Gwei for >30 minutes → Pause until normalized
4. Detected Sybil attack (>100 new agents in 1 hour) → Manual review required

---

## 6. Break-Even Analysis

### 6.1 Monthly Break-Even Calculation

**Fixed Costs**:
```
Infrastructure:         $484/month
Operational buffer:     $300/month
────────────────────────────────
Total Fixed:            $784/month
```

**Variable Costs Per Sponsorship**:
```
Gas + bundler + infra:  $0.054/tx
Risk buffer:            $0.016/tx
────────────────────────────────
Total Variable:         $0.070/tx
```

**Revenue Per Sponsorship**: $0.10/tx

**Contribution Margin**: $0.10 - $0.070 = $0.03/tx (30%)

**Break-Even Volume**:
```
Fixed Costs / Contribution Margin = Break-Even Txs
$784 / $0.03 = 26,133 sponsorships/month

Daily: 26,133 / 30 = ~871 sponsorships/day
```

### 6.2 Profitability Scenarios

**Conservative Scenario** (5,000 txs/month):
```
Revenue:  5,000 × $0.10 = $500
Costs:    $784 + (5,000 × $0.07) = $784 + $350 = $1,134
────────────────────────────────────────────────────
Loss:     -$634/month ❌
```
*Not viable - need VC funding or protocol grants to subsidize*

**Base Case** (30,000 txs/month):
```
Revenue:  30,000 × $0.10 = $3,000
Costs:    $784 + (30,000 × $0.07) = $784 + $2,100 = $2,884
────────────────────────────────────────────────────
Profit:   $116/month (4% margin) ✅
```
*Sustainable but low margin - suitable for DAO treasury management*

**Growth Scenario** (100,000 txs/month):
```
Revenue:  100,000 × $0.10 = $10,000
Costs:    $784 + (100,000 × $0.07) = $784 + $7,000 = $7,784
────────────────────────────────────────────────────
Profit:   $2,216/month (22% margin) ✅✅
```
*Strong profitability - suitable for protocol-owned infrastructure*

**Scale Scenario** (500,000 txs/month):
```
Revenue:  500,000 × $0.10 = $50,000
Costs:    $1,200 (higher infra) + (500,000 × $0.065) = $33,700
────────────────────────────────────────────────────
Profit:   $16,300/month (33% margin) ✅✅✅
```
*At scale, unit costs drop (bulk RPC discounts, economies of scale)*

---

## 7. Growth Economics & Unit Economics

### 7.1 Customer Acquisition Cost (CAC)

**Protocol Acquisition Channels**:
| Channel | CAC | Conversion Rate | LTV | LTV:CAC Ratio |
|---------|-----|----------------|-----|---------------|
| Builder Quest / Hackathons | $0 | 5% | $600 | ∞ |
| Direct outreach (Base ecosystem) | $50 | 15% | $1,200 | 24:1 |
| Farcaster marketing | $20 | 3% | $600 | 30:1 |
| Technical docs + GitHub | $10 | 2% | $400 | 40:1 |
| Referrals (protocol-to-protocol) | $0 | 10% | $800 | ∞ |

**Target CAC**: <$30/protocol
**Target LTV**: >$600/protocol (6 months avg retention)
**Target LTV:CAC**: >20:1

### 7.2 Lifetime Value (LTV) Calculation

**Average Protocol Lifetime Value**:
```
Monthly Revenue per Protocol:
- Bronze tier (50 protocols): $50/month
- Silver tier (15 protocols): $200/month
- Gold tier (5 protocols): $500/month

Weighted Average Monthly Revenue:
(50 × $50 + 15 × $200 + 5 × $500) / 70 = $100/month

Average Retention: 6 months (early estimate)
Churn Rate: 16.7%/month

LTV = $100 × 6 months = $600/protocol
```

**Improved Retention Strategies**:
- Add analytics dashboard → +2 months retention (LTV: $800)
- Multi-chain support → +3 months retention (LTV: $900)
- Enterprise SLAs → +6 months retention (LTV: $1,200)

### 7.3 Network Effects & Viral Coefficient

**Viral Loop**:
1. Protocol A integrates Aegis for their 50 agents
2. Agents post activity to Farcaster (social proof)
3. Protocol B sees Aegis sponsorships in their feed
4. Protocol B evaluates Aegis (2-week trial)
5. Protocol B onboards → brings 100 agents
6. **Viral coefficient K**: 1 protocol → 1.5 protocols (K = 1.5)

**Estimated Growth** (with K = 1.5):
- Month 1: 5 protocols (Builder Quest launch)
- Month 2: 5 + (5 × 1.5) = 12 protocols
- Month 3: 12 + (12 × 1.5) = 30 protocols
- Month 6: ~200 protocols (exponential growth)

**At 200 Protocols**:
```
Average txs per protocol: 500/month
Total monthly txs: 200 × 500 = 100,000
Monthly revenue: 100,000 × $0.10 = $10,000
Monthly costs: $7,784
Monthly profit: $2,216 (22% margin)
```

---

## 8. Funding Requirements & Runway

### 8.1 Bootstrap Scenario (No External Funding)

**Initial Capital Required**:
```
ETH Reserve (1 ETH):              $2,800
USDC Working Capital (500 USDC):  $500
3-Month Operational Buffer:       $2,352 ($784 × 3)
Marketing Budget (Builder Quest): $500
────────────────────────────────────────
Total Bootstrap Capital:          $6,152
```

**Runway to Profitability**:
- Assumes 10% monthly growth from 5,000 txs
- Break-even: Month 6 (~26,000 txs/month)
- Profitable: Month 7+ (>30,000 txs/month)

**Burn Rate** (Pre-Profitability):
```
Month 1: -$634 (5,000 txs)
Month 2: -$467 (7,500 txs)
Month 3: -$251 (11,000 txs)
Month 4: +$45 (16,000 txs) - break-even
Month 5: +$308 (22,000 txs)
Month 6: +$615 (30,000 txs) - sustained profitability
────────────────────────────────────────
Total Cash Needed: ~$1,400 (covered by $6,152 buffer)
```

### 8.2 VC-Backed Scenario

**Seed Round Target**: $150,000 (18-month runway)
```
Use of Funds:
- Operational runway (18 months):  $100,000
- Developer hiring (2 FTEs):       $30,000
- Marketing & growth:              $10,000
- Reserve capitalization (10 ETH): $10,000
────────────────────────────────────────
Total:                             $150,000
```

**Valuation Framework**:
- Pre-money valuation: $1M (10% dilution)
- Post-money valuation: $1.15M
- Target metrics (18 months): 500 protocols, 250k txs/month, $25k MRR

### 8.3 Protocol-Owned Scenario (DAO Treasury)

**Incubated by Base Ecosystem DAO**:
- Initial grant: $50,000 (covers 12-month runway)
- Governance: 5-of-9 multisig (Base ecosystem leads)
- Revenue sharing: 20% to DAO treasury
- Exit strategy: DAO can buy out for 3x trailing revenue

**Example**: Optimism RetroPGF model
- Round 1 grant: $50k (build + launch)
- Round 2 grant: $100k (based on impact: txs sponsored, protocols onboarded)
- Round 3: Self-sustaining (DAO exits, Aegis becomes independent)

---

## 9. Key Performance Indicators (KPIs)

### 9.1 Financial Metrics

**Revenue Metrics**:
- Monthly Recurring Revenue (MRR): Target $10,000/month by Month 6
- Gross Margin: Target 30% (consistent across scale)
- Net Profit Margin: Target 20%+ at 100k txs/month

**Cost Metrics**:
- Cost per Sponsorship: Target <$0.065 (via economies of scale)
- CAC Payback Period: Target <2 months
- LTV:CAC Ratio: Target >20:1

**Reserve Health**:
- ETH Reserve Utilization: Keep between 0.1-2 ETH
- USDC Working Capital: Keep >100 USDC
- Reserve Ratio (ETH/USDC): Target 1:1 in USD value

### 9.2 Operational Metrics

**Sponsorship Metrics**:
- Total Sponsorships/Month: Track growth (target 10% MoM)
- Sponsorship Success Rate: Target >95%
- Average Sponsorship Value: Track $0.10 consistency
- Sponsorship Latency: Target <10s (from request to confirmation)

**Protocol Metrics**:
- Total Protocols Onboarded: Target 200 by Month 12
- Active Protocols (>10 txs/month): Target 80% activity rate
- Protocol Churn Rate: Target <10%/month
- Avg Txs per Protocol: Target 500/month

**Agent Metrics**:
- Total Autonomous Agents Served: Track cumulative
- Avg Agents per Protocol: Target 10-20
- Agent Legitimacy Rate: Track % passing policy (target >70%)
- Agent Retention (30-day): Track agents using Aegis 2+ times

### 9.3 Technical Metrics

**Performance**:
- API Latency (p99): Target <500ms
- Decision Cycle Time: Target <60s
- Smart Contract Gas Efficiency: Track gas/tx over time

**Reliability**:
- Uptime: Target 99.9% (max 43 minutes downtime/month)
- Failed Sponsorship Rate: Target <5%
- Circuit Breaker Triggers: Track frequency (target <2/month)

**Security**:
- Abuse Detection Rate: Track Sybil/spam blocks (target 0 false positives)
- Policy Violation Rate: Track rule failures (target <1%)

---

## 10. Sensitivity Analysis

### 10.1 Gas Price Sensitivity

**Impact of Base Gas Price Changes**:

| Gas Price | Cost/Sponsorship | Margin | Break-Even Txs |
|-----------|-----------------|--------|----------------|
| 0.01 Gwei | $0.052 | 48% | 16,333 txs |
| 0.05 Gwei (baseline) | $0.070 | 30% | 26,133 txs |
| 0.10 Gwei | $0.088 | 12% | 65,333 txs |
| 0.50 Gwei | $0.224 | -124% | ❌ Not viable |

**Mitigation**:
- Circuit breaker pauses sponsorships if gasPrice >2 Gwei
- Dynamic pricing: Charge $0.12 if gasPrice between 1-2 Gwei
- Protocol alerts: Notify when gas conditions unfavorable

### 10.2 Protocol Adoption Sensitivity

**Impact of Protocol Count on Profitability**:

| Protocols | Avg Txs/Month | Total Txs | Monthly Profit | Margin |
|-----------|--------------|-----------|----------------|--------|
| 10 | 500 | 5,000 | -$634 | -127% |
| 50 | 500 | 25,000 | -$134 | -5% |
| 70 | 500 | 35,000 | +$266 | 9% |
| 100 | 500 | 50,000 | +$716 | 14% |
| 200 | 500 | 100,000 | +$2,216 | 22% |

**Conclusion**: Need minimum 70 protocols to break even

### 10.3 Pricing Sensitivity

**Impact of Price Per Sponsorship**:

| Price | Monthly Revenue (30k txs) | Profit | Margin | Protocol Appeal |
|-------|--------------------------|--------|--------|----------------|
| $0.05 | $1,500 | -$1,384 | -92% | ✅✅ High |
| $0.08 | $2,400 | -$484 | -20% | ✅ Good |
| $0.10 (baseline) | $3,000 | +$116 | 4% | ✅ Fair |
| $0.15 | $4,500 | +$1,616 | 36% | ⚠️ Moderate |
| $0.20 | $6,000 | +$3,116 | 52% | ❌ Low |

**Optimal Pricing**:
- **$0.10**: Best balance of profitability + protocol adoption
- **$0.08**: Loss leader to bootstrap (subsidize with grants)
- **$0.15**: Premium tier for enterprise protocols

---

## 11. Competitive Landscape & Moats

### 11.1 Competitor Analysis

| Solution | Cost Model | Target User | Autonomy | Moat |
|----------|-----------|-------------|----------|------|
| **Pimlico Paymaster** | $0.03-0.05/tx | dApp developers | Semi-autonomous | Bundler network |
| **Alchemy Gas Manager** | $0.04/tx | Web3 apps | Manual approval | Enterprise sales |
| **Safe Sponsorship** | Free (protocol-owned) | Safe wallet users | Manual | Brand + ecosystem |
| **Aegis** | $0.10/tx | Autonomous agents | Fully autonomous | Agent-first, x402 |

**Aegis Differentiation**:
1. **Agent-First**: Only solution built for autonomous agents (not human wallets)
2. **x402 Native**: Agent-to-agent payment coordination (competitors use API keys)
3. **Autonomous Decision Making**: LLM-powered legitimacy scoring (competitors require whitelists)
4. **Social Proof**: On-chain + Farcaster transparency (competitors are black boxes)

### 11.2 Economic Moats

**1. Network Effects** (Strong Moat)
- More protocols → more agents → more social proof → more protocols
- Viral coefficient K = 1.5 (exponential growth)
- First-mover advantage in agent economy

**2. Data Moat** (Medium Moat)
- Agent legitimacy dataset (historical txs, abuse patterns)
- LLM training data (successful sponsorship decisions)
- Protocol behavior patterns (budget usage, agent types)

**3. Integration Moat** (Medium Moat)
- x402 payment standard adoption (switching cost)
- Protocol contracts whitelisted (re-verification friction)
- Agent SDK integrations (developer lock-in)

**4. Cost Advantage** (Weak Moat)
- Economies of scale at 100k+ txs/month (bulk RPC discounts)
- Automated reserve management (no manual overhead)
- **But**: Competitors can match costs with VC funding

### 11.3 Strategic Defensibility

**Long-Term Moats**:
1. **ERC-8004 Integration**: If Aegis becomes the default agent identity verifier
2. **Multi-Chain Expansion**: First to support Optimism, Arbitrum, Polygon PoS
3. **Agent Marketplace**: Platform for protocols to discover/hire autonomous agents
4. **RetroPGF Sustainability**: Continuous funding from Base ecosystem (Optimism model)

---

## 12. Risks & Mitigation Strategies

### 12.1 Economic Risks

**Risk 1: Gas Price Volatility**
- **Impact**: 10x gas spike → $0.35/tx cost → -250% margin
- **Probability**: Low (Base avg: 0.05 Gwei, spikes rare)
- **Mitigation**:
  - Circuit breaker at 2 Gwei
  - Dynamic pricing: $0.15/tx during 1-2 Gwei periods
  - Insurance pool: 10% of revenue reserved for gas spikes

**Risk 2: Protocol Churn**
- **Impact**: 50% churn rate → revenue drops 50% → unprofitable
- **Probability**: Medium (early-stage product risk)
- **Mitigation**:
  - Annual contracts (12-month prepay, 20% discount)
  - Retention incentives (month 6 free if renew)
  - Proactive support (dedicated Slack channel for gold tier)

**Risk 3: Competition from Free Solutions**
- **Impact**: Protocols build own relayers → Aegis irrelevant
- **Probability**: Medium (technical protocols may self-host)
- **Mitigation**:
  - Focus on non-technical protocols (DeFi, NFTs, gaming)
  - Offer open-source self-hosted option (Aegis Lite)
  - Upsell to managed service (analytics, SLAs, multi-chain)

### 12.2 Operational Risks

**Risk 1: Reserve Depletion**
- **Impact**: ETH reserve → 0 → sponsorships halt → protocol churn
- **Probability**: Low (automatic reserve swaps)
- **Mitigation**:
  - Min reserve: 0.1 ETH (covers 357 sponsorships)
  - Emergency USDC → ETH swap if ETH < 0.05
  - Multi-sig backup: 5 ETH held in Gnosis Safe

**Risk 2: Smart Contract Bug**
- **Impact**: AegisActivityLogger exploit → funds drained
- **Probability**: Low (audited + tested)
- **Mitigation**:
  - Full Ackee audit before mainnet
  - Gradual rollout: 100 txs → 1,000 txs → 10,000 txs
  - Bug bounty: $50,000 for critical vulnerabilities

**Risk 3: LLM Reasoning Failure**
- **Impact**: False negatives (reject legitimate agents) → protocol dissatisfaction
- **Probability**: Medium (LLMs hallucinate)
- **Mitigation**:
  - Policy engine overrides LLM (hard caps enforced)
  - Manual review queue for edge cases
  - A/B test GPT-4 vs Claude (choose best accuracy)

---

## 13. Success Criteria (6-Month Milestones)

### Month 1-2: Launch & Validation
- [ ] 5 protocols onboarded (Builder Quest cohort)
- [ ] 500 sponsorships executed
- [ ] 95%+ sponsorship success rate
- [ ] Smart contract audit completed (Ackee)
- [ ] $0/month burn (covered by Builder Quest grant)

### Month 3-4: Growth & Optimization
- [ ] 25 protocols onboarded (5x growth)
- [ ] 10,000 sponsorships executed
- [ ] <$0.068 cost per sponsorship (optimization)
- [ ] Farcaster engagement: 100+ followers
- [ ] Break-even or close (-$200/month burn max)

### Month 5-6: Scale & Profitability
- [ ] 70+ protocols onboarded (break-even threshold)
- [ ] 35,000+ sponsorships executed
- [ ] +$300/month profit (sustainable)
- [ ] Multi-chain expansion (Optimism support)
- [ ] Retention rate: >85% (low churn)

---

## 14. Conclusion & Recommendations

### Economic Viability Assessment: **✅ VIABLE** (with caveats)

**Strengths**:
- ✅ Strong unit economics (30% margin at scale)
- ✅ Clear value proposition (10-20 dev hours saved/month)
- ✅ Network effects (K = 1.5 viral coefficient)
- ✅ Low CAC (<$30/protocol via organic growth)
- ✅ Agent-first positioning (differentiated from competitors)

**Weaknesses**:
- ⚠️ High break-even threshold (26,133 txs/month = 70 protocols)
- ⚠️ Gas price sensitivity (10x spike → unprofitable)
- ⚠️ Early-stage churn risk (6-month avg LTV)
- ⚠️ Competition from free alternatives (Safe, protocol-owned relayers)

**Recommendation**: **Proceed with Bootstrap + Grant Funding Strategy**

**Optimal Launch Strategy**:
1. **Builder Quest Grant**: $10,000 (covers 3-month runway)
2. **Optimism RetroPGF**: $50,000 (Round 5, Q2 2026)
3. **Protocol Partnerships**: 10 anchor protocols commit $500/month (guaranteed $5k MRR)
4. **Milestone-Based VC**: Raise $150k seed after hitting 50 protocols

**Critical Success Factors**:
1. Achieve 70+ protocols by Month 6 (break-even)
2. Maintain <10% monthly churn rate
3. Keep gas costs <$0.065/tx via optimization
4. Secure RetroPGF or grant funding by Month 4

**Exit Scenarios** (3-year horizon):
- **Scenario A**: Acquired by Base/Coinbase for $5-10M (strategic infrastructure)
- **Scenario B**: Spin out as DAO-owned public good (RetroPGF sustainability)
- **Scenario C**: Bootstrap to profitability, remain independent (10-20 protocols, niche service)

---

**Last Updated**: February 2, 2026
**Next Review**: March 1, 2026 (post-Builder Quest launch)
**Maintained By**: Aegis Core Team
