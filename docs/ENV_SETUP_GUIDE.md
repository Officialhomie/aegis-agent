# Aegis Agent – Environment variables and field setup

This guide lists **every env var** the agent uses, which are **required to transact**, and **step-by-step how to get them** (including ETH keys and RPC).

---

## Quick reference: what you need to transact

| Priority | Purpose | Key vars |
|----------|--------|----------|
| **Critical** | Start agent + sign + RPC | `DATABASE_URL`, `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`), `EXECUTE_WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY`, `RPC_URL_BASE_SEPOLIA` or `RPC_URL_BASE` |
| **High** | Live execution (AgentKit) | `CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY`, `AGENT_NETWORK_ID` |
| **High** | On-chain log + reserve | `ACTIVITY_LOGGER_ADDRESS`, `USDC_ADDRESS` (for reserve pipeline), `AGENT_WALLET_ADDRESS` (optional but recommended) |
| **Medium** | Social + API auth | `NEYNAR_API_KEY`, `FARCASTER_SIGNER_UUID`, `AEGIS_API_KEY`, `REACTIVE_CALLBACK_SECRET` |
| **Optional** | Everything else | See full table below |

**Production (Moltbook, Farcaster, x402, always-on):** see **[docs/PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)**.

---

## Full list of env vars (by category)

### Critical – must set for agent to run and transact

| Variable | Used for | How to get it |
|----------|----------|----------------|
| `DATABASE_URL` | Prisma (memory, state, protocol data) | **Step 1** below |
| `OPENAI_API_KEY` | GPT-4 reasoning (or use Claude) | **Step 2** below |
| `EXECUTE_WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY` | Signing txs, paymaster, ERC-8004 | **Step 3 (ETH keys)** below |
| `RPC_URL_BASE_SEPOLIA` or `RPC_URL_BASE` | Base RPC (code also reads `BASE_RPC_URL`) | **Step 4 (RPC)** below |

### High – needed for full “field” behavior

| Variable | Used for | How to get it |
|----------|----------|----------------|
| `CDP_API_KEY_NAME` | AgentKit (transfers, swaps, execution) | **Step 5 (CDP)** below |
| `CDP_API_KEY_PRIVATE_KEY` | AgentKit auth | Same as Step 5 |
| `AGENT_NETWORK_ID` | Chain (e.g. `base-sepolia` or `base`) | Set to `base-sepolia` or `base` |
| `ACTIVITY_LOGGER_ADDRESS` | On-chain audit log | After **Step 6 (deploy)** |
| `AGENT_WALLET_ADDRESS` | Registration, paymaster, reserve | Derive from private key or set to your agent address |
| `USDC_ADDRESS` | Reserve pipeline (balance, swaps) | Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `AEGIS_API_KEY` | Auth for `/api/agent/cycle`, `/api/reactive/event` | Generate: `openssl rand -base64 32` |

### Medium – recommended for production

| Variable | Used for | How to get it |
|----------|----------|----------------|
| `NEYNAR_API_KEY` | Farcaster (post sponsorship proofs) | https://neynar.com → API key |
| `FARCASTER_SIGNER_UUID` | Signing Farcaster casts | Create signer via Neynar API for your Farcaster account |
| `REACTIVE_CALLBACK_SECRET` | HMAC for `/api/reactive/event` | `openssl rand -hex 32` |
| `REACTIVE_OBSERVER_ADDRESS` | Event-driven mode | After deploy: `npm run deploy:reactive-observer` |
| `BUNDLER_RPC_URL` | Paymaster / account abstraction | e.g. Pimlico: https://dashboard.pimlico.io |

### Optional – defaults or feature-specific

| Variable | Used for |
|----------|----------|
| `ANTHROPIC_API_KEY`, `USE_CLAUDE_REASONING` | Claude instead of OpenAI |
| `OPENAI_REASONING_MODEL`, `ANTHROPIC_REASONING_MODEL` | Model overrides |
| `PINECONE_*` | Vector memory (optional) |
| `BASE_RPC_URL`, `RPC_URL_BASE`, `RPC_URL_84532`, `RPC_URL_8453` | RPC aliases (see Step 4) |
| `RPC_URL_ETHEREUM`, `RPC_URL_SEPOLIA` | Ethereum / Sepolia if needed |
| `FOUNDRY_ACCOUNT`, `DEPLOYER_PRIVATE_KEY` | Deploy scripts (can reuse agent key) |
| `BASESCAN_API_KEY` | Contract verification on deploy |
| `AGENT_EXECUTION_MODE` | `SIMULATION` \| `LIVE` \| `READONLY` |
| `AGENT_CONFIDENCE_THRESHOLD`, `MAX_TRANSACTION_VALUE_USD`, `MAX_GAS_PRICE_GWEI` | Safety limits |
| `SUPPORTED_CHAINS` | e.g. `84532,8453` |
| `X402_*` | Payment rails (paid actions) |
| `MOLTBOOK_*` | Moltbook social |
| `IPFS_*`, `IPFS_GATEWAY_URL` | IPFS for decisions/metadata |
| `ERC8004_*`, `REPUTATION_ATTESTATION_CONTRACT_ADDRESS` | Identity/reputation |
| `BLOCKSCOUT_API_URL` | Low-gas wallet discovery |
| `TREASURY_ADDRESS` | Treasury observation |
| `RESERVE_THRESHOLD_ETH`, `TARGET_RESERVE_ETH`, `RESERVE_CRITICAL_ETH`, `MIN_USDC_FOR_SWAP` | Reserve pipeline thresholds |
| `RESERVE_PIPELINE_INTERVAL_MS`, `SPONSORSHIP_INTERVAL_MS` | Loop intervals |
| `RUNWAY_ALERT_DAYS` | Runway alerts |
| `WHITELISTED_LOW_GAS_CANDIDATES`, `WHITELISTED_NEW_WALLET_CANDIDATES` | Sponsorship whitelists |
| `ABUSE_SCAM_CONTRACTS`, `ABUSE_BLACKLIST` | Abuse detection |
| `REDIS_URL` | Persistent rate limit / circuit breaker |
| `SLACK_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `ALERT_EMAIL` | Alerts |
| `BOTCHAN_*`, `ENS_NAME`, `DONATE_*`, `DEPLOY_TOKEN_ALLOWED` | Botchan, ENS, donate, deploy token |
| `ENTRY_POINT_ADDRESS`, `PAYMASTER_RPC_URL` | ERC-4337 |
| `ALLOWED_CONTRACT_ADDRESSES` | EXECUTE whitelist |
| `LOG_LEVEL`, `SENTRY_DSN`, `NEXT_PUBLIC_APP_URL`, `AEGIS_DASHBOARD_URL` | Logging, monitoring, dashboard |
| `COINGECKO_API_KEY`, `ORACLE_CACHE_*` | Oracles |
| `CURRENT_GAS_PRICE_GWEI` | Price API override |

---

## Step-by-step: how to get the important ones

### Step 1 – Database (`DATABASE_URL`)

- **Local:** Install PostgreSQL, create DB, then e.g.  
  `postgresql://postgres:password@localhost:5432/aegis`
- **Hosted:** Create a Postgres DB on Supabase, Neon, or Railway; copy the connection string.
- Then in project: `npx prisma migrate dev`

### Step 2 – OpenAI or Claude (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)

- **OpenAI:** https://platform.openai.com/api-keys → Create key (starts with `sk-proj-...`). Billing must be enabled.
- **Claude:** https://console.anthropic.com → API keys. Set `USE_CLAUDE_REASONING=true` and `ANTHROPIC_API_KEY=sk-ant-...`.

### Step 3 – ETH / agent wallet private key (`EXECUTE_WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY`)

You need **one** private key the agent uses to sign (paymaster, logging, identity). Options:

**Option A – New wallet (recommended for testnet/production)**  
1. Install Foundry: https://book.getfoundry.sh/getting-started/installation  
2. Create a new wallet and get private key + address:
   ```bash
   cast wallet new
   ```
   Save the printed **private key** (64 hex chars, with or without `0x`) and **address**.  
3. Set in `.env`:
   - `EXECUTE_WALLET_PRIVATE_KEY=0x<64 hex chars>`  
   - `AGENT_WALLET_ADDRESS=0x<address>` (optional but recommended)

**Option B – Use existing wallet (e.g. MetaMask)**  
1. In MetaMask: Account menu → “Account details” → “Show private key” (only on a **dedicated** agent wallet, never your main wallet).  
2. Copy the key (add `0x` if missing).  
3. Set `EXECUTE_WALLET_PRIVATE_KEY=0x...` and optionally `AGENT_WALLET_ADDRESS=0x...`.

**Option C – Foundry keystore (for deploy scripts)**  
1. `cast wallet import my-agent --interactive` and paste your private key.  
2. Set `FOUNDRY_ACCOUNT=my-agent`.  
3. For the **agent** itself you still set `EXECUTE_WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY` (the code does not read the keystore for paymaster/execution).

**Fund the wallet (testnet):**  
- Base Sepolia ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet  
- Base Sepolia USDC: https://faucet.circle.com  
- Check: `cast balance $AGENT_WALLET_ADDRESS --rpc-url $RPC_URL_BASE_SEPOLIA`

### Step 4 – RPC URLs (`RPC_URL_BASE_SEPOLIA` / `RPC_URL_BASE` / `BASE_RPC_URL`)

- **Alchemy:** https://dashboard.alchemy.com → New app → Base Sepolia (or Base Mainnet) → copy “HTTPS” URL.  
  - Example: `https://base-sepolia.g.alchemy.com/v2/YOUR_KEY`  
  - Set `RPC_URL_BASE_SEPOLIA=...` for testnet and/or `RPC_URL_BASE` or `BASE_RPC_URL` for mainnet.
- **Infura:** https://infura.io → Create project → Endpoints → Base Sepolia / Base Mainnet.  
- **QuickNode:** Create Base endpoint, copy HTTP URL.  
- Code accepts: `BASE_RPC_URL`, `RPC_URL_BASE`, `RPC_URL_BASE_SEPOLIA`, `RPC_URL_84532` (Sepolia), `RPC_URL_8453` (mainnet). Set the one that matches your target chain.

### Step 5 – Coinbase Developer Platform – CDP (for AgentKit execution)

Required for **LIVE** transfers/swaps/execution via AgentKit.

1. Go to https://portal.cdp.coinbase.com/  
2. Sign in / sign up.  
3. Create an API key: Product → “AgentKit” or “API Keys” → Create; download or copy the **API key name** (e.g. `organizations/.../apiKeys/...`) and the **EC private key** (PEM).  
4. In `.env`:
   - `CDP_API_KEY_NAME="organizations/xxx/apiKeys/yyy"`  
   - `CDP_API_KEY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"`  
   Use `\n` for newlines if stored on one line.

### Step 6 – Deploy contracts and set addresses

1. Set RPC and key (see above). For deploy you can use the same key:  
   `DEPLOYER_PRIVATE_KEY=0x...` or `EXECUTE_WALLET_PRIVATE_KEY=0x...`  
2. Deploy Activity Logger (required for on-chain audit):
   ```bash
   npm run deploy:activity-logger
   ```
   Copy the logged contract address into `.env`:  
   `ACTIVITY_LOGGER_ADDRESS=0x...`  
3. Optional – Reactive Observer (event-driven mode):
   ```bash
   npm run deploy:reactive-observer
   ```
   Set `REACTIVE_OBSERVER_ADDRESS=0x...`

### Step 7 – Put it all in `.env`

1. Copy the field template into your env file:
   ```bash
   cp field.env.template .env
   ```
2. Open `.env` and fill every value you need (start with Critical + High above).  
3. Never commit `.env` (it should be in `.gitignore`).

---

## Minimal “field” set (copy-paste checklist)

Fill these and you can run and transact (testnet):

```bash
# Critical
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="sk-proj-..."
EXECUTE_WALLET_PRIVATE_KEY="0x..."
RPC_URL_BASE_SEPOLIA="https://base-sepolia.g.alchemy.com/v2/..."
# or for mainnet: RPC_URL_BASE="https://base-mainnet.g.alchemy.com/v2/..."

# High (for live execution + on-chain log)
CDP_API_KEY_NAME="organizations/.../apiKeys/..."
CDP_API_KEY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
AGENT_NETWORK_ID="base-sepolia"
AGENT_WALLET_ADDRESS="0x..."
ACTIVITY_LOGGER_ADDRESS="0x..."
USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
AEGIS_API_KEY="<openssl rand -base64 32>"
```

Then:

1. `npx prisma migrate dev`  
2. `npm run deploy:activity-logger` → set `ACTIVITY_LOGGER_ADDRESS`  
3. Fund `AGENT_WALLET_ADDRESS` on Base Sepolia  
4. `npm run agent:start` or hit `/api/agent/cycle` with `Authorization: Bearer $AEGIS_API_KEY`

---

## Troubleshooting

- **“EXECUTE_WALLET_PRIVATE_KEY or AGENT_PRIVATE_KEY required”**  
  Set one of them (and optionally `AGENT_WALLET_ADDRESS`) in `.env`.

- **“CDP API credentials not configured”**  
  Set `CDP_API_KEY_NAME` and `CDP_API_KEY_PRIVATE_KEY` for LIVE execution.

- **“RPC_URL_BASE_SEPOLIA or RPC_URL_84532 must be configured”**  
  Set `RPC_URL_BASE_SEPOLIA` (or `BASE_RPC_URL` / `RPC_URL_BASE` for mainnet).

- **“Insufficient funds”**  
  Fund the agent wallet (faucets above for testnet).

- **“ACTIVITY_LOGGER_ADDRESS not set”**  
  Deploy with `npm run deploy:activity-logger` and add the address to `.env`.

- **P1008 / SocketTimeout / “Database unavailable”**  
  The DB connection or query is timing out (common with Supabase pooler or high latency). The app now uses a connection pool with longer timeouts and keepalives. If errors persist:
  - Ensure `DATABASE_URL` uses the **session-mode pooler** (port **5432**) for Supabase.
  - Optionally set `DATABASE_CONNECT_TIMEOUT_MS=20000`, `DATABASE_IDLE_TIMEOUT_MS=45000`, `DATABASE_POOL_MAX=5`.
  - Check Supabase dashboard for DB health and connection limits.
  - Restart the agent so it creates a new pool with the updated settings.

For more, see the “TROUBLESHOOTING” section in `.env.testing.template` in the repo root.
