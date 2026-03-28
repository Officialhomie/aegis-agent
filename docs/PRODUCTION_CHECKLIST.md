# Aegis Agent – Production checklist

Use this checklist to run the agent in production with **Moltbook**, **Farcaster**, **x402**, and **ERC-8004**, and to keep it **always running**.

---

## 1. Moltbook (social / engagement)

Moltbook is used for reputation (karma in unified reputation) and for posting treasury insights and engaging with the feed.

### Configure

| Variable | Purpose |
|----------|--------|
| `MOLTBOOK_API_KEY` | Agent API key from Moltbook (required for posting and heartbeat) |
| `MOLTBOOK_HEARTBEAT_INTERVAL` | Ms between heartbeat runs (default `14400000` = 4 hours) |
| `MOLTBOOK_SUBMOLT` | Submolt to post to (default `general`) |

**Rate limit:** Moltbook allows **1 post per 30 minutes**. The agent enforces this (posts only when ≥30 min since last post). Use `MOLTBOOK_HEARTBEAT_INTERVAL` ≥ 1800000 (30 min).

### Steps

1. **Register the agent on Moltbook** (one-time):
   ```bash
   npx tsx scripts/register-moltbook.ts
   # Or: npx tsx scripts/register-moltbook.ts --name "Aegis" --description "AI-powered treasury agent"
   ```
2. Copy the printed `api_key` into `.env`:
   ```env
   MOLTBOOK_API_KEY="<printed api_key>"
   ```
3. (Optional) Claim the agent at the printed `claim_url` in the browser.
4. Restart the agent. The agent loop now runs **Moltbook heartbeat** every 15 minutes (the heartbeat itself posts/engages only when `MOLTBOOK_HEARTBEAT_INTERVAL` has elapsed since last run).

Without `MOLTBOOK_API_KEY`, the heartbeat is skipped; the agent still runs reserve pipeline and gas sponsorship.

---

## 2. Farcaster (logs and transparency)

Farcaster is used to post sponsorship proofs (after each sponsored tx) and periodic health summaries.

### Configure

| Variable | Purpose |
|----------|--------|
| `NEYNAR_API_KEY` | Neynar API key (required to publish casts) |
| `FARCASTER_SIGNER_UUID` or `NEYNAR_SIGNER_UUID` | Signer UUID for your Farcaster account |
| `FARCASTER_FID` | (Optional) Your Farcaster FID for reference |

### Steps

1. Get **Neynar** API key: https://neynar.com → API keys.
2. Create a **signer** for your Farcaster account (Neynar docs or dashboard) and get the **Signer UUID**.
3. Set in `.env`:
   ```env
   NEYNAR_API_KEY="your_neynar_api_key"
   FARCASTER_SIGNER_UUID="your_signer_uuid"
   ```
4. Restart the agent. The agent loop now runs **Farcaster health updates** every 15 minutes; the actual post is throttled to **once every 4 hours** (stored in reserve state). Each time the agent executes a **SPONSOR_TRANSACTION**, it also posts a **sponsorship proof** cast.

To test Farcaster only:
```bash
npm run test:farcaster
```

Without `NEYNAR_API_KEY` or `FARCASTER_SIGNER_UUID`, casts are skipped (no errors); sponsorship proofs and health posts are no-ops.

---

## 3. x402 (payment rails for production)

x402 is used for paid agent actions (verify payment via facilitator, then execute).

### Configure

| Variable | Purpose |
|----------|--------|
| `X402_ENABLED` | Set `true` to enable x402 payment verification and execution |
| `X402_FACILITATOR_URL` | Facilitator API URL (e.g. `https://x402.org/facilitator`) |
| `X402_API_KEY` | (Optional) API key for facilitator auth |
| `X402_MIN_PAYMENT_USD` | Minimum payment in USD to accept |
| `X402_BASE_FEE_USDC` | Base fee in USDC |
| `X402_GAS_MARKUP` | Gas cost markup multiplier |
| `X402_EXECUTION_MODE` | `SIMULATION` \| `LIVE` – use `LIVE` for production paid execution |

### Steps for production

1. Set in `.env`:
   ```env
   X402_ENABLED="true"
   X402_FACILITATOR_URL="https://x402.org/facilitator"
   X402_API_KEY=""
   X402_EXECUTION_MODE="LIVE"
   ```
2. Ensure your **pricing endpoint** is reachable (e.g. `/api/agent/price`) and that the facilitator can call your **webhook** (`/api/protocol/webhook`) if required.
3. For production, obtain and set `X402_API_KEY` if your facilitator requires it.

The agent already exposes x402-compatible endpoints; enabling and setting `X402_EXECUTION_MODE=LIVE` makes paid actions execute on-chain.

---

## 4. ERC-8004 (on-chain identity / reputation)

The agent registers on ERC-8004 for on-chain identity and reputation. Registration requires the agent wallet to have **gas**.

### Fix “gas required exceeds allowance (0)”

1. **Fund the agent wallet** on the chain you use (e.g. Base Sepolia):
   - Get `AGENT_WALLET_ADDRESS` from `.env`.
   - Use a faucet, e.g. [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet).
2. Ensure **RPC** is set for that chain (e.g. `RPC_URL_BASE_SEPOLIA` or `RPC_URL_BASE`).
3. Restart the agent; registration will be attempted again on startup.

Optional env for custom registries:

- `ERC8004_NETWORK`, `ERC8004_IDENTITY_REGISTRY_ADDRESS`, `ERC8004_REPUTATION_REGISTRY_ADDRESS`, `ERC8004_RPC_URL`

---

## 5. Keep the agent always running

Run the agent as a long-lived process so it keeps polling and posting.

### Option A: PM2 (Node)

```bash
npm install -g pm2
cd aegis-agent
pm2 start npm --name "aegis-agent" -- run agent:start
pm2 save
pm2 startup   # enable restart on reboot
```

Check status: `pm2 status` / `pm2 logs aegis-agent`

### Option B: systemd (Linux)

Create `/etc/systemd/system/aegis-agent.service`:

```ini
[Unit]
Description=Aegis Agent
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/aegis-agent
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run agent:start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable aegis-agent
sudo systemctl start aegis-agent
sudo systemctl status aegis-agent
```

Load `.env` by adding `EnvironmentFile=/path/to/aegis-agent/.env` or using a wrapper script that sources it.

### Option C: Docker

Add a Dockerfile or use a Node image, set `CMD ["npm", "run", "agent:start"]`, and pass env (or mount `.env`). Run with a restart policy, e.g. `docker run -d --restart unless-stopped ...`.

### Option D: Cloud (Railway, Fly.io, Render, etc.)

- Set **start command** to `npm run agent:start`.
- Add all required env vars in the platform’s dashboard.
- Use a single long-running process (no serverless for the agent loop).

---

## Quick reference: env for “full production”

| Area | Required / recommended |
|------|------------------------|
| **Moltbook** | `MOLTBOOK_API_KEY` (after `register-moltbook.ts`) |
| **Farcaster** | `NEYNAR_API_KEY`, `FARCASTER_SIGNER_UUID` |
| **x402** | `X402_ENABLED=true`, `X402_FACILITATOR_URL`, `X402_EXECUTION_MODE=LIVE` |
| **ERC-8004** | Fund `AGENT_WALLET_ADDRESS` with gas on target chain |
| **Always on** | Run `npm run agent:start` under PM2, systemd, Docker, or cloud |

See **docs/ENV_SETUP_GUIDE.md** for the full list of environment variables and how to obtain them.

- **Message formats:** Exact Moltbook and Farcaster message structures and verify links → **[docs/MESSAGE_STRUCTURES.md](MESSAGE_STRUCTURES.md)**.
- **ERC-8004 on Base Sepolia:** Registry address, env vars, and "gas required exceeds allowance" → **[docs/ERC8004_BASE_SEPOLIA.md](ERC8004_BASE_SEPOLIA.md)**.
