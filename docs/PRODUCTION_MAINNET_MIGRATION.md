# Production Mainnet Migration Guide

This guide walks you through moving Aegis from **Base Sepolia (testnet)** to **Base Mainnet** so you can sponsor real transactions for protocols.

**Code change included:** `src/lib/agent/execute/agentkit.ts` now uses **AGENT_NETWORK_ID** for the EXECUTE path and simulation: when `AGENT_NETWORK_ID=base`, it uses Base mainnet (chain + RPC_URL_BASE); otherwise Base Sepolia.

---

## Overview

| Area | Testnet (current) | Production (target) |
|------|-------------------|----------------------|
| Chain | Base Sepolia (84532) | Base Mainnet (8453) |
| RPC | RPC_URL_BASE_SEPOLIA | RPC_URL_BASE |
| Network ID | AGENT_NETWORK_ID=base-sepolia | AGENT_NETWORK_ID=base |
| Default chain | SUPPORTED_CHAINS=84532 (or 84532,8453) | SUPPORTED_CHAINS=8453 |
| Contracts | Deployed on Sepolia | Deploy on Base Mainnet |
| USDC | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |
| Wallet | Test ETH/USDC | Real ETH/USDC on Base |

---

## Phase 1: Local / Env and Code Readiness

### 1.1 Environment variables (mainnet values)

In your `.env` (and later in Railway for **aegis-agent-worker** and **aegis-web**), set or update:

```bash
# --- Network: Base Mainnet ---
AGENT_NETWORK_ID=base
SUPPORTED_CHAINS=8453

# RPC (use your Alchemy/Infura key for Base mainnet)
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_MAINNET_KEY
# Optional: keep Sepolia for reference
# RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/...

# --- Mainnet contract addresses (canonical) ---
USDC_ADDRESS_BASE_MAINNET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# For observations/default chain mainnet, set:
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# ALLOWED_CONTRACT_ADDRESSES: Base mainnet Uniswap + core (see addresses.ts CONTRACTS.base)
ALLOWED_CONTRACT_ADDRESSES=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x4200000000000000000000000000000000000006,0x0000000071727De22E5E9d8BAf0edAc6f37da032,0x33128a8fC17869897dcE68Ed026d694621f6FDfD,0x2626664c2603336E57B271c5C0b26F421741e481,0x6fF5693b99212Da76ad316178A184AB56D299b43,0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1,0x000000000022D473030F116dDEE9F6B43aC78BA3

# ACTIVITY_LOGGER_ADDRESS: set after Phase 2 (deploy)
# ACTIVITY_LOGGER_ADDRESS=0x...
```

Leave **ACTIVITY_LOGGER_ADDRESS** unset until you deploy the logger on mainnet (Phase 2).

### 1.2 Code: EXECUTE path and chain selection

The execute layer in `src/lib/agent/execute/agentkit.ts` currently **hardcodes Base Sepolia** for the `EXECUTE` contract-call path (transfer/approve):

- It uses `baseSepolia` and `RPC_URL_BASE_SEPOLIA` / `RPC_URL_84532` only.

To run production on Base mainnet you must make this path respect **AGENT_NETWORK_ID**:

- When `AGENT_NETWORK_ID=base`: use viem chain **base** and **RPC_URL_BASE**.
- When `AGENT_NETWORK_ID=base-sepolia`: keep current behavior (baseSepolia + RPC_URL_BASE_SEPOLIA).

Suggested change (conceptual):

- Import `base` from `viem/chains`.
- In `executeContractCall`, derive `chain` and `rpcUrl` from `process.env.AGENT_NETWORK_ID`:
  - `base` → chain `base`, rpcUrl `process.env.RPC_URL_BASE ?? process.env.RPC_URL_8453`
  - `base-sepolia` (default) → chain `baseSepolia`, rpcUrl `process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532`
- Use that `chain` and `rpcUrl` for `createWalletClient` and `createPublicClient`.

After this change, the rest of the agent (AgentKit transfer/swap/rebalance, paymaster, observe) already use `AGENT_NETWORK_ID` and/or `getDefaultChainName()` (from `SUPPORTED_CHAINS`), so they will follow mainnet once env is set.

### 1.3 ERC-8004 identity (optional)

- `src/lib/agent/identity/constants.ts` has ERC-8004 registries for **mainnet** (Ethereum), **sepolia**, and **base-sepolia**. There is **no "base" (Base mainnet)** entry.
- For **Base mainnet only** sponsorship you can leave **ERC8004_NETWORK** unset or leave identity features disabled.
- If you use identity on **Ethereum mainnet**, set `ERC8004_NETWORK=mainnet` and `RPC_URL_ETHEREUM`.

---

## Phase 2: Deploy contracts on Base Mainnet

Deploy with Foundry (cast/forge). Use the **same** wallet you will use as the agent (or a deployer that transfers ownership to `AGENT_WALLET_ADDRESS`).

### 2.1 Prerequisites

- **RPC:** Base mainnet RPC (e.g. Alchemy): `RPC_URL_BASE`
- **Wallet:** `AGENT_NETWORK_ID=base` and either:
  - `FOUNDRY_ACCOUNT` + keystore password, or
  - `EXECUTE_WALLET_PRIVATE_KEY` / `DEPLOYER_PRIVATE_KEY`
- **AGENT_WALLET_ADDRESS:** the address that will be allowed to log (activity logger) or operate (reactive observer).

### 2.2 Deploy AegisActivityLogger (required for on-chain logging)

```bash
cd aegis-agent
export AGENT_NETWORK_ID=base
export RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
export AGENT_WALLET_ADDRESS=0x...   # your agent wallet

# Optional: verification
export BASESCAN_API_KEY=...        # Base mainnet Basescan API key

npm run deploy:activity-logger
```

- Copy the **deployed address** from the script output.
- Set in env (local and Railway): **ACTIVITY_LOGGER_ADDRESS** = that address.

### 2.3 Deploy AegisReactiveObserver (optional; for event-triggered cycles)

```bash
export AGENT_NETWORK_ID=base
export RPC_URL_BASE=...
npm run deploy:reactive-observer
```

- If your stack uses this contract, set the deployed address in the relevant env (e.g. webhook URL or config that points to this contract).

### 2.4 Other contracts

- **Paymaster / autonomous paymaster:** If you have a deploy script (e.g. `deploy-autonomous-paymaster.ts`), run it with `AGENT_NETWORK_ID=base` and `RPC_URL_BASE`, then set any new addresses in env.
- **Uniswap / Aave / USDC:** No deployment needed; use canonical Base mainnet addresses from `src/lib/agent/contracts/addresses.ts` (CONTRACTS.base) and **ALLOWED_CONTRACT_ADDRESSES** as in Phase 1.

---

## Phase 3: Fund the agent wallet on Base Mainnet

- Send **real ETH** to **AGENT_WALLET_ADDRESS** on Base mainnet (for gas).
- Optionally send **USDC** (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) for reserve pipeline / rebalancing.

Check balance:

```bash
cast balance $AGENT_WALLET_ADDRESS --rpc-url $RPC_URL_BASE
cast balance $AGENT_WALLET_ADDRESS 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --erc20 --rpc-url $RPC_URL_BASE
```

---

## Phase 4: Database and protocols

- **ProtocolSponsor / protocols:** Your app stores `chainId` (e.g. in Prisma). Existing protocols may have been registered with `chainId = 84532`. For production:
  - Either register **new** protocols for Base mainnet (chainId **8453**), or
  - Update existing protocol records to use chainId **8453** if they are meant to run on mainnet.
- **Reserve / budget state:** Ensure any protocol-specific config (contract addresses, chainId) matches mainnet. Redis state will refresh from the new chain once the worker runs with mainnet env.

---

## Phase 5: Railway (and any other deploy) production config

Set these on **aegis-agent-worker** (and, where needed, **aegis-web**) in Railway Variables.

### 5.1 Switch to mainnet

```bash
# Worker (and web if it reads these)
railway variables --service aegis-agent-worker --set "AGENT_NETWORK_ID=base" --set "SUPPORTED_CHAINS=8453"
railway variables --service aegis-web --set "AGENT_NETWORK_ID=base" --set "SUPPORTED_CHAINS=8453"
```

### 5.2 RPC and addresses

- **RPC_URL_BASE** = your Base mainnet RPC (e.g. Alchemy).
- **USDC_ADDRESS** or **USDC_ADDRESS_BASE_MAINNET** = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- **ALLOWED_CONTRACT_ADDRESSES** = mainnet list (see Phase 1.1).
- **ACTIVITY_LOGGER_ADDRESS** = address from Phase 2.2.

### 5.3 Optional but recommended

- **RESERVE_CRITICAL_ETH** / **TARGET_RESERVE_ETH**: adjust for mainnet gas and economics (e.g. higher than testnet).
- **MAX_GAS_PRICE_GWEI**, **MAX_TRANSACTION_VALUE_USD**: set to production-safe limits.
- **GAS_SPONSORSHIP_HEALTH_SKIP_THRESHOLD**, **AGENT_CONFIDENCE_THRESHOLD**: tune as needed.

### 5.4 ERC-8004 (optional)

- For Base-only production: leave **ERC8004_NETWORK** unset or remove it.
- For Ethereum mainnet identity: **ERC8004_NETWORK**=mainnet and **RPC_URL_ETHEREUM**.

### 5.5 Redeploy

- After changing variables, redeploy **aegis-agent-worker** and **aegis-web** so they pick up mainnet env.
- Worker start command remains: `npx tsx scripts/run-agent.ts`.

---

## Phase 6: Verification

1. **Worker logs**
   - `railway link -s aegis-agent-worker && railway logs`
   - Confirm no “wrong network” or RPC errors; cycles should run against Base mainnet.

2. **Health and Redis**
   - `curl https://<aegis-web-url>/api/health`
   - `curl https://<aegis-web-url>/api/health/redis`
   - Expect `redis: connected` and reserve/health data (chainId 8453 in state once observed).

3. **Dashboard**
   - Open the dashboard; verify reserve health and protocol data reflect Base mainnet (8453).

4. **One sponsorship (dry run then live)**
   - If you have a protocol registered for chainId 8453 and a test user on mainnet, trigger a cycle and confirm:
     - Observation and decision use mainnet RPC and addresses.
     - Execution (if LIVE) uses mainnet and allowed mainnet contracts only.

---

## Checklist summary

- [ ] **Env/code:** Set AGENT_NETWORK_ID=base, SUPPORTED_CHAINS=8453, RPC_URL_BASE, mainnet USDC and ALLOWED_CONTRACT_ADDRESSES.
- [ ] **Code:** Update `agentkit.ts` EXECUTE path to use chain + RPC from AGENT_NETWORK_ID (base → Base mainnet).
- [ ] **Contracts:** Deploy AegisActivityLogger (and optional ReactiveObserver) on Base mainnet; set ACTIVITY_LOGGER_ADDRESS.
- [ ] **Wallet:** Fund AGENT_WALLET_ADDRESS with ETH (and optionally USDC) on Base mainnet.
- [ ] **DB/Protocols:** Register or update protocols for chainId 8453.
- [ ] **Railway:** Set mainnet variables on worker and web; redeploy both.
- [ ] **Verify:** Logs, /api/health, dashboard, and one end-to-end sponsorship on mainnet.

After this, the stack is configured for production and can sponsor real transactions on Base mainnet.
