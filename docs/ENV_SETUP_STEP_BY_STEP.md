# Environment Variables – Step-by-Step Setup

This module walks you through obtaining and setting **every remaining env var** for Aegis. Do the steps in order; skip sections you don’t need (marked optional).

---

## Table of contents

1. [REACTIVE_CALLBACK_SECRET](#1-reactive_callback_secret) (required for reactive webhooks)
2. [FARCASTER_FID](#2-farcaster_fid) (required if using Farcaster)
3. [PINECONE_API_KEY](#3-pinecone_api_key) (optional – vector memory)
4. [REACTIVE_OBSERVER_ADDRESS](#4-reactive_observer_address) (after Step 2 deploy)
5. [AGENT_NETWORK_ID](#5-agent_network_id) (mainnet vs testnet)
6. [DEPLOYER_PRIVATE_KEY](#6-deployer_private_key) (only for contract deploy)
7. [REDIS_URL](#7-redis_url) (optional – circuit breaker / cache)
8. [PINATA_JWT](#8-pinata_jwt) (optional – IPFS / ERC-8004)
9. [X402_API_KEY](#9-x402_api_key) (optional – x402 paid actions)
10. [OPENAI_API_KEY](#10-openai_api_key) (optional – only if not using Claude)

---

## 1. REACTIVE_CALLBACK_SECRET

**Purpose:** HMAC secret for `/api/reactive/event` webhook. Callers must sign requests with this secret; if unset, the endpoint denies all requests.

**Required:** Yes, if you use the Reactive Network or any client that POSTs to that endpoint.

### Steps

1. **Generate a random secret (32+ characters).**

   **Option A – Terminal (recommended):**
   ```bash
   openssl rand -hex 32
   ```
   Copy the output (e.g. `a1b2c3d4e5...`).

   **Option B – Node:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Put it in `.env`:**
   ```bash
   REACTIVE_CALLBACK_SECRET="<paste-the-hex-string-here>"
   ```
   Example:
   ```bash
   REACTIVE_CALLBACK_SECRET="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
   ```

3. **If you use the Reactive Network:** Configure the same value in their dashboard as the webhook secret so their requests are signed correctly.

---

## 2. FARCASTER_FID

**Purpose:** Your Farcaster ID (numeric). Used for transparency posts and Neynar API context. You already have **NEYNAR_API_KEY** and **FARCASTER_SIGNER_UUID**; FID is the numeric ID of the Farcaster user that owns the signer.

**Required:** Yes, if you post to Farcaster (sponsorship proofs / health updates).

### Steps

1. **Open Neynar Dashboard:**  
   https://dashboard.neynar.com  

2. **Log in** with the same account you use for the Neynar API key.

3. **Find your FID:**
   - Go to **Apps** or **Signers** (or the app that has your **FARCASTER_SIGNER_UUID**).
   - The FID is shown next to your Farcaster username (e.g. `12345`).
   - Alternatively: open https://warpcast.com/~/settings and check the URL or profile; some UIs show “FID: 12345”.

4. **Or via Neynar API (if you have API key):**
   ```bash
   curl -s -H "api_key: YOUR_NEYNAR_API_KEY" \
     "https://api.neynar.com/v2/farcaster/user/bulk?fids=ME" | jq .
   ```
   If you use a signer, look up the signer in the dashboard; the linked user’s FID is what you need.

5. **Set in `.env`:**
   ```bash
   FARCASTER_FID="12345"
   ```
   Use your actual numeric FID (no quotes in value if you prefer; app uses `Number(process.env.FARCASTER_FID)` or string).

---

## 3. PINECONE_API_KEY

**Purpose:** Vector DB for agent long-term memory (embeddings). If you don’t use memory features, you can leave this empty or skip.

**Required:** No (optional).

### Steps

1. **Sign up / log in:**  
   https://www.pinecone.io  

2. **Create an API key:**
   - In the Pinecone console, open **API Keys** (left sidebar or project settings).
   - Click **Create API Key**.
   - Name it (e.g. `aegis-prod`), copy the key once (it’s shown only once).

3. **Create an index (if not already):**
   - **Indexes** → **Create Index**.
   - Name: `aegis-memory` (or match `PINECONE_INDEX_NAME` in `.env`).
   - Dimensions: e.g. `1536` (OpenAI) or `1024` (Anthropic) – check `src/lib/agent/memory/embeddings.ts` for the dimension your app uses.
   - Metric: Cosine.
   - Region: e.g. `us-east-1` (match `PINECONE_ENVIRONMENT`).

4. **Set in `.env`:**
   ```bash
   PINECONE_API_KEY="pcsk_xxxxxxxxxxxxxxxxxxxxxxxx"
   PINECONE_ENVIRONMENT="us-east-1"
   PINECONE_INDEX_NAME="aegis-memory"
   ```
   Replace with your key and index name; environment is the cloud region (e.g. `us-east-1`, `eu-west-1`).

---

## 4. REACTIVE_OBSERVER_ADDRESS

**Purpose:** On-chain ReactiveObserver contract address. The app uses it for reactive event subscriptions.

**Required:** Yes, if you use reactive / event-driven flows. Filled **after** you deploy the contract (Step 2 in PRODUCTION_DEPLOYMENT.md).

### Steps

1. **Deploy the contract** (see PRODUCTION_DEPLOYMENT.md § 2 – Smart Contract Deployment):
   ```bash
   npm run deploy:reactive-observer
   ```
2. **Copy the printed contract address** (e.g. `0x1234...`).
3. **Set in `.env`:**
   ```bash
   REACTIVE_OBSERVER_ADDRESS="0x1234567890abcdef..."
   ```

---

## 5. AGENT_NETWORK_ID

**Purpose:** Network the agent uses: `base` = Base Mainnet, `base-sepolia` = Base Sepolia testnet.

**Required:** Yes. Must match your RPC and contracts.

### Steps

1. **Choose network:**
   - Production mainnet → `base`
   - Testnet → `base-sepolia`

2. **Set in `.env`:**
   ```bash
   AGENT_NETWORK_ID="base"
   ```
   or
   ```bash
   AGENT_NETWORK_ID="base-sepolia"
   ```

3. **Ensure RPC URLs match:**  
   For `base`, use Base Mainnet URLs (e.g. Alchemy/Pimlico for chain 8453). For `base-sepolia`, use testnet URLs (84532).

---

## 6. DEPLOYER_PRIVATE_KEY

**Purpose:** Used only when **deploying** contracts (`npm run deploy:activity-logger`, `deploy:reactive-observer`, `deploy:all`). Not needed for app runtime on Vercel. Optional in `.env` if you deploy from another machine or Railway.

**Required:** Only for the machine/environment that runs deploy scripts.

### Steps

1. **If you deploy from this repo:**
   - Use the **deployer** wallet (not the agent wallet).
   - Export private key from MetaMask/other wallet, or use Foundry:
     ```bash
     cast wallet private-key --account deployer-mainnet
     ```
   - Put it in `.env` **only** on the machine that runs deploys (never commit, never in Vercel):
     ```bash
     DEPLOYER_PRIVATE_KEY="0xabcdef1234567890..."
     ```

2. **If you deploy from Railway:**  
   Set `DEPLOYER_PRIVATE_KEY` in Railway → Variables (secret). Leave it empty in `.env`.

3. **If you never deploy from this machine:**  
   Leave `DEPLOYER_PRIVATE_KEY=""` in `.env`.

---

## 7. REDIS_URL

**Purpose:** Redis for circuit breaker state and optional caching. If not set, the app uses in-memory state (fine for single instance / dev).

**Required:** No (optional). Recommended for production with restarts or multiple instances.

### Steps

1. **Sign up / log in:**  
   https://upstash.com  

2. **Create a Redis database:**
   - **Redis** → **Create Database**.
   - Name: e.g. `aegis-prod`.
   - Region: choose one close to your app (e.g. `us-east-1`).
   - Click **Create**.

3. **Get the URL:**
   - Open the database → **REST API** or **Connect**.
   - Copy the **Redis URL** (e.g. `rediss://default:xxx@xxx.upstash.io:6379`).

4. **Set in `.env`:**
   ```bash
   REDIS_URL="rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379"
   ```
   Optional (defaults in code):
   ```bash
   REDIS_CACHE_ENABLED="true"
   ```

---

## 8. PINATA_JWT

**Purpose:** Pinata JWT for uploading JSON/metadata to IPFS (e.g. ERC-8004 identity metadata). Only needed if you use IPFS upload in the app.

**Required:** No (optional). Required only if you use ERC-8004 metadata upload to IPFS.

### Steps

1. **Sign up / log in:**  
   https://app.pinata.cloud  

2. **Create API key:**
   - **API Keys** → **New Key**.
   - Name: e.g. `aegis-ipfs`.
   - Enable **pinFileToIPFS** and **pinJSONToIPFS**.
   - Create and copy the **JWT** (starts with `eyJ...`).

3. **Set in `.env`:**
   ```bash
   PINATA_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```

4. **Optional:** If you use a custom gateway:
   ```bash
   IPFS_GATEWAY_URL="https://gateway.pinata.cloud"
   ```

---

## 9. X402_API_KEY and X402_FACILITATOR_URL

**Purpose:** x402 payment facilitator verifies paid actions. If you don’t use x402, set `X402_ENABLED="false"` and leave the rest empty.

**Required:** No (optional). Only if you use x402 paid execution.

**Using Coinbase CDP for x402?** See **[docs/X402_AND_COINBASE_CDP.md](X402_AND_COINBASE_CDP.md)** for a full breakdown. With CDP you use your **existing CDP keys** (no separate X402 API key); set `X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402"` and leave `X402_API_KEY=""`.

### Steps (generic facilitator, e.g. x402.org)

1. **Open x402:**  
   https://x402.org (or the facilitator URL you use).

2. **Register / log in** and find **API Keys** or **Developer** section.

3. **Create an API key** and copy it.

4. **Set in `.env`:**
   ```bash
   X402_API_KEY="your-actual-x402-api-key"
   X402_FACILITATOR_URL="https://x402.org/facilitator"
   ```
   If you don’t use x402:
   ```bash
   X402_ENABLED="false"
   ```
   and you can leave `X402_API_KEY=""` or remove it.

---

## 10. OPENAI_API_KEY

**Purpose:** Used only when **not** using Claude for reasoning (e.g. `USE_CLAUDE_REASONING="false"`). Your app is set to Claude, so this is optional.

**Required:** No (optional). Only if you switch to OpenAI for reasoning.

### Steps

1. **Open:**  
   https://platform.openai.com/api-keys  

2. **Create API key** → copy (starts with `sk-...`).

3. **Set in `.env` only if using OpenAI for reasoning:**
   ```bash
   OPENAI_API_KEY="sk-..."
   USE_CLAUDE_REASONING="false"
   OPENAI_REASONING_MODEL="gpt-4-turbo"
   ```
   If you use Claude (current setup), leave `OPENAI_API_KEY="sk-..."` as placeholder or remove; do **not** set a real key unless you need it.

---

## Quick checklist (copy to your notes)

| # | Variable | Where to get it | Required? |
|---|----------|-----------------|-----------|
| 1 | REACTIVE_CALLBACK_SECRET | `openssl rand -hex 32` | Yes (if reactive webhooks) |
| 2 | FARCASTER_FID | Neynar dashboard or Warpcast | Yes (if Farcaster) |
| 3 | PINECONE_API_KEY | pinecone.io → API Keys + index | Optional |
| 4 | REACTIVE_OBSERVER_ADDRESS | After `npm run deploy:reactive-observer` | After Step 2 |
| 5 | AGENT_NETWORK_ID | Set to `base` or `base-sepolia` | Yes |
| 6 | DEPLOYER_PRIVATE_KEY | Wallet export / `cast wallet private-key` | Only for deploy |
| 7 | REDIS_URL | upstash.com → Create Redis → copy URL | Optional |
| 8 | PINATA_JWT | pinata.cloud → API Keys → JWT | Optional (IPFS) |
| 9 | X402_API_KEY | x402.org (or your facilitator) | Optional (x402) |
| 10 | OPENAI_API_KEY | platform.openai.com → API Keys | Optional (if not Claude) |

---

## After editing .env

1. **Never commit `.env`** (it should be in `.gitignore`).
2. **Railway:** Copy only the variables you want on Railway into **Railway → Variables**; never put deployer or agent private keys in the repo.
3. **Vercel:** Add the same vars in **Vercel → Project → Settings → Environment Variables** (mark secrets as sensitive).
4. Restart the app after changing env vars.

---

*Last updated: 2026-02-09. Aligns with PRODUCTION_DEPLOYMENT.md and PREFLIGHT_ENV_STATUS.md.*
