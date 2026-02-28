---
name: aegis-gas-estimation
description: Accurate gas cost estimation for multi-chain ERC-4337 UserOperations
version: 1.0.0
author: Aegis Team
tags: [gas, estimation, erc-4337, l2]
---

# Gas Estimation Skill

Estimate gas costs for ERC-4337 UserOperations across Ethereum mainnet and L2s.

## Key Principles

1. **Base Mainnet**: Highest gas costs, use as baseline
2. **L2s (Arbitrum, Optimism, Base)**: 10-100x cheaper than mainnet
3. **Account Abstraction Overhead**: ~40k-50k gas for bundler processing
4. **Buffer for Volatility**: Add 20-30% safety margin

## Estimation Formula

```
Total Cost = (Verification Gas + Execution Gas + Pre-verification Gas) × Gas Price × ETH/USD
```

### Chain-Specific Multipliers

- **Ethereum Mainnet**: 1.0x (baseline)
- **Base**: 0.01x (100x cheaper)
- **Arbitrum**: 0.02x (50x cheaper)
- **Optimism**: 0.015x (67x cheaper)

### Gas Components

1. **Verification Gas**: 50,000-150,000 gas (validate signature, check balance)
2. **Execution Gas**: Variable (depends on transaction complexity)
3. **Pre-verification Gas**: 21,000-50,000 gas (bundler overhead)

## Examples

### Example 1: Simple Transfer on Base
```
Verification: 100,000 gas
Execution: 21,000 gas
Pre-verification: 30,000 gas
Total: 151,000 gas

Base Gas Price: 0.001 gwei
Cost: 151,000 × 0.001 gwei = 0.000151 ETH
At $2500 ETH: $0.000377
```

### Example 2: Complex Swap on Mainnet
```
Verification: 120,000 gas
Execution: 200,000 gas
Pre-verification: 40,000 gas
Total: 360,000 gas

Mainnet Gas Price: 20 gwei
Cost: 360,000 × 20 gwei = 7,200,000 gwei = 0.0072 ETH
At $2500 ETH: $18.00
```

## Guidelines

1. Always fetch current gas prices from RPC
2. Add 30% buffer for estimation safety
3. Reject if gas price >100 gwei on mainnet (likely spam/attack)
4. For L2s, use optimistic estimation (lower bound)
5. Check guarantee constraints before approving

## Red Flags

- Gas price >200 gwei (potential attack)
- Execution gas >1M (suspiciously complex)
- Cost >$100 for simple transfer (likely misconfigured)
