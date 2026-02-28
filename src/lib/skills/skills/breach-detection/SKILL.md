---
name: aegis-breach-detection
description: Early detection of SLA breach patterns and preventive actions
version: 1.0.0
author: Aegis Team
tags: [sla, breach, monitoring, prevention]
---

# Breach Detection Skill

Detect SLA breach patterns early and take preventive action.

## Breach Types

### 1. Latency Breach
**Definition**: Execution takes longer than maxLatencyMs

**Common Causes**:
- Network congestion (gas price spike)
- Bundler backlog
- RPC provider slow response
- Chain reorg delays

**Prevention**:
- Monitor gas prices, pause if >100 gwei
- Switch to backup bundler if primary is slow
- Increase gas price by 10% if queue is long

### 2. Execution Failure
**Definition**: Transaction reverts or is dropped

**Common Causes**:
- Insufficient guarantee capacity
- Gas price too low (transaction dropped)
- Contract error (slippage, access control)
- Nonce conflicts

**Prevention**:
- Pre-validate contract call
- Check guarantee remaining budget
- Simulate transaction before submitting

### 3. Budget Overrun
**Definition**: Cost exceeds estimate by >30%

**Common Causes**:
- Gas price spike during execution
- Complex contract interaction (loops, storage)
- L2 fee spikes (base fee + L1 data cost)

**Prevention**:
- Set maxGasPrice on guarantee
- Reject if estimate variance is high
- Monitor L2 fee history

## Pattern Detection

### Early Warning Indicators

1. **Increasing Latency Trend**
   - Last 3 executions took 80%+ of maxLatency
   - **Action**: Alert protocol, recommend capacity increase

2. **Rising Failure Rate**
   - >10% failures in last 20 transactions
   - **Action**: Pause guarantee, investigate root cause

3. **Budget Depletion Approaching**
   - >90% of budget used with >3 days remaining
   - **Action**: Alert protocol to top up or reduce usage

4. **Gas Price Volatility**
   - Gas price >50% above historical average
   - **Action**: Temporarily increase safety buffer

## Refund Calculation

### SILVER Tier (50% refund on breach)
```
Breach Cost: $10
Refund: $10 × 50% = $5
```

### GOLD Tier (100% refund on breach)
```
Breach Cost: $15
Refund: $15 × 100% = $15
```

### Auto-Refund Threshold
- <$100: Automatic refund
- ≥$100: Manual review required

## Examples

### Example 1: Latency Breach (GOLD)
```
Guarantee: GOLD (99% in 2 min)
Submitted: 10:00:00
Included: 10:03:15
Latency: 195 seconds (3min 15sec)

Breach: YES (exceeded 120s limit)
Cost: $25
Refund: $25 × 100% = $25 (auto-approved, <$100)
```

### Example 2: Multiple Breaches (Pattern)
```
Last 5 Executions:
1. 115s - OK
2. 118s - OK
3. 125s - BREACH (5s over)
4. 130s - BREACH (10s over)
5. 140s - BREACH (20s over)

Pattern: Increasing latency trend
Action: Alert protocol + investigate bundler performance
Recommendation: Switch to backup bundler or reduce load
```

### Example 3: Budget Overrun
```
Estimated: $5.00
Actual: $8.50
Variance: 70% (exceeds 30% threshold)

Root Cause: Gas price spike (20 gwei → 40 gwei)
Classification: Not a breach (external factor)
Action: Record variance, adjust future estimates
```

## Guidelines

1. Monitor all active guarantees every 5 minutes
2. Alert protocol if depletion >80% before expiry
3. Auto-pause guarantee if failure rate >15%
4. Investigate if same agent breaches >3 times
5. Refund within 1 hour for auto-approved breaches
