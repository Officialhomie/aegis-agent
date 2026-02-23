---
name: aegis-agent-reputation
description: Compute trust scores from on-chain sponsorship history
version: 1.0.0
author: Aegis Team
tags: [reputation, passport, trust, risk]
---

# Agent Reputation Skill

Evaluate agent trustworthiness based on Gas Passport metrics.

## Trust Score Formula

```
Trust Score = (Success Rate × 40%) +
              (Consistency × 20%) +
              (Protocol Diversity × 20%) +
              (Recency × 10%) +
              (Volume × 10%)
```

### Component Weights

1. **Success Rate (40%)**: Most important - do transactions succeed?
2. **Consistency (20%)**: Regular usage vs burst patterns
3. **Protocol Diversity (20%)**: Single protocol vs ecosystem participant
4. **Recency (10%)**: Active recently vs dormant
5. **Volume (10%)**: Total sponsored value

## Tier Thresholds

| Tier | Trust Score | Criteria |
|------|-------------|----------|
| WHALE | 90-100 | >$10k volume + PREMIUM criteria |
| PREMIUM | 85-100 | 200+ txs, 95%+ success, 5+ protocols |
| TRUSTED | 70-85 | 50+ txs, 90%+ success, 3+ protocols |
| ACTIVE | 50-70 | 5+ txs, 80%+ success |
| NEWCOMER | 0-50 | <5 txs or new account |
| FLAGGED | N/A | Red flags present |

## Red Flags (Auto-Flag)

- **HIGH_FAILURE_RATE**: >20% transactions fail
- **BURST_PATTERN**: >80% txs within 1-hour windows
- **UNUSUAL_TIMING**: Peak activity 2-5 AM UTC
- **VALUE_ANOMALY**: Max value >10x average
- **ASSOCIATED_BLOCK**: Linked to blocked wallets

## Examples

### Example 1: Established Trading Bot
```
Metrics:
- Success Rate: 98% (200/204 txs)
- Consistency: 0.15 (low variance)
- Protocol Diversity: 0.82 (8 protocols)
- Recency: 2 days since last
- Volume: $5,420

Calculation:
Trust = (0.98 × 40) + (0.85 × 20) + (0.82 × 20) + (0.95 × 10) + (0.70 × 10)
Trust = 39.2 + 17 + 16.4 + 9.5 + 7 = 89.1

Tier: PREMIUM
Decision: APPROVE with high confidence
```

### Example 2: New Agent
```
Metrics:
- Success Rate: 100% (3/3 txs)
- Consistency: N/A (insufficient data)
- Protocol Diversity: 0.0 (1 protocol)
- Recency: Today
- Volume: $12

Trust = (1.0 × 40) + (0.5 × 20) + (0.0 × 20) + (1.0 × 10) + (0.01 × 10)
Trust = 40 + 10 + 0 + 10 + 0.1 = 60.1

Tier: NEWCOMER
Decision: APPROVE but with limits
```

### Example 3: Suspicious Pattern
```
Metrics:
- Success Rate: 85% (170/200 txs)
- Consistency: 0.9 (high variance - burst pattern)
- Protocol Diversity: 0.1 (1 protocol)
- Recency: Today
- Volume: $2,200

Red Flags:
- BURST_PATTERN (95% txs in 3-hour windows)
- UNUSUAL_TIMING (peak at 3 AM UTC)

Tier: FLAGGED
Decision: ESCALATE for manual review
```

## Guidelines

1. Always check for red flags first
2. Minimum 5 transactions for reliable score
3. Re-compute score after every 10 transactions
4. Upgrade tier automatically when thresholds crossed
5. Manual review required to clear FLAGGED status
