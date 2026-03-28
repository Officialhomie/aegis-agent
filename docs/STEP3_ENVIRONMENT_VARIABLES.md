# Step 3: Environment Variables

Prepare a **complete production environment** so the app and agent can run in production (Section 3 of PRODUCTION_DEPLOYMENT.md). You can use a single `.env` for local and as the source for Railway/Vercel, or keep a separate `.env.production` for deployment.

---

## 1. Goal

- **Critical** and **high-priority** variables set so the app starts and core features work.
- **Contract addresses** from Step 2 in place: `ACTIVITY_LOGGER_ADDRESS`, `REACTIVE_OBSERVER_ADDRESS`.
- **No secrets in git:** `.env` and `.env.production` are in `.gitignore`.

---

## 2. Full template reference

The **complete list** of variables and categories is in **PRODUCTION_DEPLOYMENT.md § 3.1–3.2**. Use it as the canonical reference.

| Category        | Required? | Purpose |
|----------------|----------|---------|
| **Critical**   | Yes      | App won’t start without these (network, wallet, DB, AI, CDP, API key). |
| **High**       | Yes      | Core features (RPC, bundler, contracts, Pinecone). |
| **Medium**     | Optional | Farcaster, Redis, IPFS, x402, ERC-8004. |
| **Optional**   | Nice to have | Monitoring, oracles, safety limits, logging. |

---

## 3. Checklist after Step 2

You’ve deployed contracts. Use this to confirm env is ready for production.

### 3.1 Contract addresses (from Step 2)

- [ ] **ACTIVITY_LOGGER_ADDRESS** is set in `.env` (and in `.env.production` if you use it).
- [ ] **REACTIVE_OBSERVER_ADDRESS** is set in `.env` (and in `.env.production` if you use it).

### 3.2 Critical (app won’t start without these)

- [ ] **AGENT_NETWORK_ID** = `"base"` for mainnet (or `"base-sepolia"` for testnet).
- [ ] **AGENT_WALLET_ADDRESS** = your agent wallet (0x...).
- [ ] **DATABASE_URL** and **DIRECT_URL** = production Postgres (e.g. Supabase).
- [ ] **ANTHROPIC_API_KEY**, **USE_CLAUDE_REASONING**, **ANTHROPIC_REASONING_MODEL**.
- [ ] **CDP_API_KEY_NAME**, **CDP_API_KEY_PRIVATE_KEY** (AgentKit).
- [ ] **AEGIS_API_KEY** = a strong random value (e.g. 32+ chars).
- [ ] **Signing:** either **KEYSTORE_ACCOUNT** + **KEYSTORE_PASSWORD** (no AGENT_PRIVATE_KEY in file) or **EXECUTE_WALLET_PRIVATE_KEY** / **AGENT_PRIVATE_KEY** only where the app runs (e.g. Railway Variables).

### 3.3 High priority (core features)

- [ ] **RPC_URL_BASE** (and **BASE_RPC_URL**) = Base mainnet RPC (e.g. Alchemy).
- [ ] **BUNDLER_RPC_URL** = Pimlico (or other ERC-4337 bundler) for chain 8453.
- [ ] **ACTIVITY_LOGGER_ADDRESS**, **REACTIVE_OBSERVER_ADDRESS** (see 3.1).
- [ ] **PINECONE_API_KEY**, **PINECONE_ENVIRONMENT**, **PINECONE_INDEX_NAME** if you use vector memory.

### 3.4 Production-only tweaks (optional)

- [ ] **AGENT_EXECUTION_MODE** = `"LIVE"` when you want real on-chain execution (keep `SIMULATION` until you’re ready).
- [ ] **NODE_ENV** = `"production"` in the deployment environment (Railway/Vercel often set this).
- [ ] **LOG_LEVEL** = `"info"` (or `"warn"`) in production.
- [ ] **NEXT_PUBLIC_APP_URL** and **AEGIS_DASHBOARD_URL** = your production app URL.

### 3.5 Security

- [ ] **.env** and **.env.production** are **not** committed (confirm they’re in `.gitignore`).
- [ ] **DEPLOYER_PRIVATE_KEY** and **EXECUTE_WALLET_PRIVATE_KEY** are only set where needed (local deploy / Railway), never in a file you commit.
- [ ] For Railway: set **EXECUTE_WALLET_PRIVATE_KEY** (or keystore) in Railway Variables, not in the repo.

---

## 4. Two ways to do Step 3

### Option A: Single `.env` (simplest)

Keep using your existing **.env** in `aegis-agent/` as the source of truth.

1. Ensure **ACTIVITY_LOGGER_ADDRESS** and **REACTIVE_OBSERVER_ADDRESS** are set (from Step 2).
2. Fill any remaining gaps using **PRODUCTION_DEPLOYMENT.md § 3.1** and **[docs/ENV_SETUP_STEP_BY_STEP.md](ENV_SETUP_STEP_BY_STEP.md)**.
3. When you deploy (e.g. Railway, Step 5), copy the **same** variables into the platform’s environment (Railway Variables, Vercel Env, etc.); do **not** commit `.env`.

### Option B: Separate `.env.production`

Use a dedicated file for production so you can differ from local (e.g. different DB, LIVE mode).

1. Copy your current `.env` to `.env.production`:
   ```bash
   cp .env .env.production
   ```
2. Edit `.env.production`:
   - Set **ACTIVITY_LOGGER_ADDRESS** and **REACTIVE_OBSERVER_ADDRESS** (from Step 2).
   - Set **AGENT_NETWORK_ID** = `"base"` and production RPC URLs.
   - Set **AGENT_EXECUTION_MODE** = `"LIVE"` when ready.
   - Remove or leave empty any vars that are only for local (e.g. **DEPLOYER_PRIVATE_KEY**).
3. Add to `.gitignore` (if not already): `.env.production`.
4. For deployment: load from `.env.production` (e.g. `railway variables --from-file .env.production`) or copy-paste into the host’s UI; never commit the file.

---

## 5. Sync env to Vercel (CLI)

From `aegis-agent/` you can push **Vercel-safe** vars from `.env` to Vercel (no private keys are ever sent). Only keys listed in `scripts/vercel-env-allowed-keys.txt` are synced.

**Prereqs:** [Vercel CLI](https://vercel.com/docs/cli) and a linked project (`vercel link` in `aegis-agent/`).

```bash
# See which keys would be synced (no API calls)
npm run vercel:env:dry

# Push .env vars to Vercel Production (and optionally Preview)
npm run vercel:env:sync

# Update existing Vercel vars (rm then add)
npm run vercel:env:sync -- --overwrite

# Also sync to Preview environment
npm run vercel:env:sync -- --preview
```

Excluded from sync: `EXECUTE_WALLET_PRIVATE_KEY`, `KEYSTORE_*`, `FOUNDRY_ACCOUNT`, `DEPLOYER_PRIVATE_KEY`, `BASESCAN_API_KEY`, `AGENT_PRIVATE_KEY`. See `vercel-env-template.txt` and `scripts/vercel-env-allowed-keys.txt`.

---

## 6. Quick validation

From `aegis-agent/`:

```bash
# Check that required vars are set (no values printed)
node -e "
const required = [
  'AGENT_NETWORK_ID', 'AGENT_WALLET_ADDRESS', 'DATABASE_URL', 'AEGIS_API_KEY',
  'RPC_URL_BASE', 'BUNDLER_RPC_URL', 'ACTIVITY_LOGGER_ADDRESS', 'REACTIVE_OBSERVER_ADDRESS'
];
require('dotenv').config();
const missing = required.filter(k => !process.env[k] || process.env[k].trim() === '');
if (missing.length) {
  console.error('Missing or empty:', missing.join(', '));
  process.exit(1);
}
console.log('All required env vars set.');
"
```

---

## 7. Next step

When the checklist above is done, move on to **Step 4: Database Setup** (migrations, seed) and then **Step 5: Infrastructure Deployment** (Railway or Docker).

---

*Aligns with PRODUCTION_DEPLOYMENT.md § 3. Last updated 2026-02-09.*
