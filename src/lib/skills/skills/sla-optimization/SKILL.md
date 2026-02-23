---
name: aegis-sla-optimization
description: Recommend optimal guarantee tier based on agent needs and network conditions
version: 1.0.0
author: Aegis Team
tags: [sla, guarantees, optimization]
---

# SLA Optimization Skill

Recommend the best execution guarantee tier for an agent's needs.

## Tier Selection Matrix

| Use Case | Recommended Tier | Reasoning |
|----------|------------------|-----------|
| MEV Bot | GOLD | Time-critical, needs 99% <2min |
| Trading Bot | SILVER | Important but tolerates 5min |
| Batch Operations | BRONZE | Not time-sensitive, save premium |
| Manual Transactions | SILVER | User expects fast confirmation |

## Decision Factors

### 1. Latency Sensitivity
- **Critical (<30s)**: GOLD (99% in 2min)
- **Important (<5min)**: SILVER (95% in 5min)
- **Flexible (>5min)**: BRONZE (best effort)

### 2. Budget Constraints
- **Premium matters**: BRONZE (0% premium)
- **Balanced**: SILVER (15% premium)
- **Performance critical**: GOLD (30% premium)

### 3. Agent Reputation
- **WHALE/PREMIUM tier**: Recommend GOLD
- **TRUSTED tier**: Recommend SILVER
- **NEWCOMER**: Recommend BRONZE (build history first)

### 4. Network Conditions
- **High congestion**: GOLD (pay for priority)
- **Normal**: SILVER (balanced)
- **Low congestion**: BRONZE (no rush)

## Examples

### Example 1: DEX Arbitrage Bot
```
Profile:
- Agent Tier: PREMIUM
- Use Case: MEV arbitrage
- Latency Need: <30 seconds
- Budget: High value trades ($1000+)

Recommendation: GOLD
Reasoning: Time-critical MEV requires fastest execution.
Premium (30%) worth it for competitive advantage.
```

### Example 2: NFT Minting Bot
```
Profile:
- Agent Tier: ACTIVE
- Use Case: Batch minting
- Latency Need: <5 minutes
- Budget: Moderate ($50/mint)

Recommendation: SILVER
Reasoning: Important to mint before sellout, but not MEV-critical.
15% premium acceptable for 95% success rate.
```

### Example 3: Portfolio Rebalancing
```
Profile:
- Agent Tier: TRUSTED
- Use Case: Monthly rebalance
- Latency Need: Within same day
- Budget: Low priority

Recommendation: BRONZE
Reasoning: Not time-sensitive, can wait for low gas.
Save premium for more critical operations.
```

## Guidelines

1. Default to SILVER for unknown use cases (balanced)
2. Upgrade to GOLD if agent explicitly requests speed
3. Downgrade to BRONZE if network is quiet (<10 gwei)
4. Consider agent's passport tier in recommendation
