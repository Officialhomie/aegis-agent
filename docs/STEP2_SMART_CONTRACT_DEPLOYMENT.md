# Step 2: Smart Contract Deployment (with Cast / Forge)

Deploy **AegisActivityLogger** and **AegisReactiveObserver** to Base Mainnet (or Base Sepolia) using Foundry (`forge` / `cast`). Follow in order.

---

## 1. Prerequisites

- **Foundry** installed: `forge --version` and `cast --version` work.
- **.env** in `aegis-agent/` with at least:
  - `AGENT_NETWORK_ID="base"` (or `base-sepolia` for testnet)
  - `RPC_URL_BASE` (and/or `BASE_RPC_URL`) = your Base RPC URL (e.g. Alchemy)
  - `AGENT_WALLET_ADDRESS` = the address that will be allowed to call the ActivityLogger (`aegisAgent`)
  - **Auth:** either **FOUNDRY_ACCOUNT** + keystore, or **DEPLOYER_PRIVATE_KEY**
  - Optional: `BASESCAN_API_KEY` for auto-verification on Basescan

**Wallet**

- Deployer wallet must have **~0.01 ETH on Base** (mainnet or Sepolia) for gas.
- If using **keystore**: create/import with cast:
  ```bash
  cast wallet import deployer-mainnet --interactive
  ```
  Then set in .env: `FOUNDRY_ACCOUNT="deployer-mainnet"`. When you run deploy, have the keystore password ready (or set `CAST_PASSWORD` for non-interactive).

- If using **private key**: set in .env only on the machine that deploys, never commit:
  ```bash
  DEPLOYER_PRIVATE_KEY="0x..."
  ```

---

## 2. Deploy with npm (recommended – uses Forge under the hood)

From the **aegis-agent** directory (where `package.json` and `contracts/` live):

```bash
cd /Users/mac/aegis-agent/aegis-agent

# Load env (if not already in shell)
export $(grep -v '^#' .env | xargs)

# Deploy ActivityLogger (needs AGENT_WALLET_ADDRESS as constructor arg)
npm run deploy:activity-logger

# Copy the printed address, then deploy ReactiveObserver
npm run deploy:reactive-observer
```

**Or deploy both in one go:**

```bash
npm run deploy:all
```

After each deploy, the script prints something like:

```text
[Deploy] AegisActivityLogger deployed to: 0x...
Next steps:
  1. Add to .env: ACTIVITY_LOGGER_ADDRESS=0x...
```

Add those addresses to `.env` as `ACTIVITY_LOGGER_ADDRESS` and `REACTIVE_OBSERVER_ADDRESS`.

---

## 3. Deploy with Cast / Forge only (no npm)

All commands from **aegis-agent** directory. Replace placeholders:

- `$RPC_URL_BASE` → your Base RPC URL (e.g. from .env)
- `$AGENT_WALLET_ADDRESS` → your agent wallet (for ActivityLogger constructor)
- `$DEPLOYER_PRIVATE_KEY` or `--account $FOUNDRY_ACCOUNT` → your deployer auth

**3.1 Build**

```bash
cd /Users/mac/aegis-agent/aegis-agent
forge build
```

**3.2 Deploy AegisActivityLogger**

Constructor: `constructor(address aegisAgent)`.

With **private key**:

```bash
export RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"
export AGENT_WALLET_ADDRESS="0x7B9763b416F89aB9A2468d8E9f041C4542B5612f"

# Encode constructor arg (address)
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address)" $AGENT_WALLET_ADDRESS)

forge create contracts/AegisActivityLogger.sol:AegisActivityLogger \
  --rpc-url "$RPC_URL_BASE" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --constructor-args $CONSTRUCTOR_ARGS \
  --broadcast
```

With **keystore** (cast will prompt for password, or use `CAST_PASSWORD`):

```bash
forge create contracts/AegisActivityLogger.sol:AegisActivityLogger \
  --rpc-url "$RPC_URL_BASE" \
  --account deployer-mainnet \
  --constructor-args $(cast abi-encode "constructor(address)" $AGENT_WALLET_ADDRESS) \
  --broadcast
```

Note the **Deployed to: 0x...** line and set `ACTIVITY_LOGGER_ADDRESS` in .env.

**3.3 Deploy AegisReactiveObserver**

No constructor args. Deployer becomes `owner()`.

With **private key**:

```bash
forge create contracts/AegisReactiveObserver.sol:AegisReactiveObserver \
  --rpc-url "$RPC_URL_BASE" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

With **keystore**:

```bash
forge create contracts/AegisReactiveObserver.sol:AegisReactiveObserver \
  --rpc-url "$RPC_URL_BASE" \
  --account deployer-mainnet \
  --broadcast
```

Set `REACTIVE_OBSERVER_ADDRESS` in .env from the printed address.

**3.4 Optional: verification at deploy time**

Add (Base mainnet chain id 8453, Sepolia 84532):

```bash
--verify --etherscan-api-key $BASESCAN_API_KEY --chain-id 8453
```

to the `forge create` commands above.

---

## 4. Verify contracts on Basescan (if not auto-verified)

**ActivityLogger** (has constructor arg):

```bash
export ACTIVITY_LOGGER_ADDRESS="0x..."   # your deployed address
export AGENT_WALLET_ADDRESS="0x..."
export BASESCAN_API_KEY="..."
export RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"

# Base mainnet (chain-id 8453)
forge verify-contract \
  $ACTIVITY_LOGGER_ADDRESS \
  contracts/AegisActivityLogger.sol:AegisActivityLogger \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" $AGENT_WALLET_ADDRESS)
```

**ReactiveObserver** (no constructor args):

```bash
export REACTIVE_OBSERVER_ADDRESS="0x..."

forge verify-contract \
  $REACTIVE_OBSERVER_ADDRESS \
  contracts/AegisReactiveObserver.sol:AegisReactiveObserver \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY
```

For **Base Sepolia**, use `--chain-id 84532`.

---

## 5. Post-deploy checks with Cast

Confirm on-chain state (replace with your RPC and addresses):

```bash
export RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"
export ACTIVITY_LOGGER_ADDRESS="0x..."
export REACTIVE_OBSERVER_ADDRESS="0x..."

# ActivityLogger: aegisAgent() should be your agent wallet
cast call $ACTIVITY_LOGGER_ADDRESS "aegisAgent()(address)" --rpc-url $RPC_URL_BASE

# ReactiveObserver: owner() should be deployer address
cast call $REACTIVE_OBSERVER_ADDRESS "owner()(address)" --rpc-url $RPC_URL_BASE
```

---

## 6. Quick reference (copy-paste)

**Env needed**

- `AGENT_NETWORK_ID=base` (or `base-sepolia`)
- `RPC_URL_BASE` (or `BASE_RPC_URL`)
- `AGENT_WALLET_ADDRESS`
- `FOUNDRY_ACCOUNT` **or** `DEPLOYER_PRIVATE_KEY`
- Optional: `BASESCAN_API_KEY`

**Deploy (npm)**

```bash
cd /Users/mac/aegis-agent/aegis-agent
npm run deploy:activity-logger   # then set ACTIVITY_LOGGER_ADDRESS in .env
npm run deploy:reactive-observer # then set REACTIVE_OBSERVER_ADDRESS in .env
# or
npm run deploy:all
```

**Deploy (forge only)**

```bash
forge build
# ActivityLogger
forge create contracts/AegisActivityLogger.sol:AegisActivityLogger --rpc-url $RPC_URL_BASE --private-key $DEPLOYER_PRIVATE_KEY --constructor-args $(cast abi-encode "constructor(address)" $AGENT_WALLET_ADDRESS) --broadcast
# ReactiveObserver
forge create contracts/AegisReactiveObserver.sol:AegisReactiveObserver --rpc-url $RPC_URL_BASE --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

**Verify**

```bash
forge verify-contract $ACTIVITY_LOGGER_ADDRESS contracts/AegisActivityLogger.sol:AegisActivityLogger --chain-id 8453 --etherscan-api-key $BASESCAN_API_KEY --constructor-args $(cast abi-encode "constructor(address)" $AGENT_WALLET_ADDRESS)
forge verify-contract $REACTIVE_OBSERVER_ADDRESS contracts/AegisReactiveObserver.sol:AegisReactiveObserver --chain-id 8453 --etherscan-api-key $BASESCAN_API_KEY
```

**Check**

```bash
cast call $ACTIVITY_LOGGER_ADDRESS "aegisAgent()(address)" --rpc-url $RPC_URL_BASE
cast call $REACTIVE_OBSERVER_ADDRESS "owner()(address)" --rpc-url $RPC_URL_BASE
```

---

*Aligns with PRODUCTION_DEPLOYMENT.md § 2. Last updated 2026-02-09.*
