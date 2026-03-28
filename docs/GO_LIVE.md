# Go Live — AegisPaymaster on Base Sepolia

Step-by-step guide to deploy AegisPaymaster, fund it, and run the end-to-end demo.

---

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed (`forge`, `cast`)
- Node.js 20+ with `npm` and `tsx`
- PostgreSQL database (for demo)
- ETH on Base Sepolia for deployer (get from [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
- [Pimlico API key](https://dashboard.pimlico.io/) for bundler

---

## Step 1: Create a signing key (one-time)

Generate a dedicated private key for paymaster approval signing. **Never use a key that holds funds.**

```bash
# Option A: Generate with cast (Foundry)
cast wallet new
# Saves private key and address to stdout — copy both

# Option B: Use cast to get address from existing key
cast wallet address --private-key 0x<your-key>
# Output is the address; use the same key as AEGIS_PAYMASTER_SIGNING_KEY
```

Add to `.env`:

```
AEGIS_PAYMASTER_SIGNING_KEY=0x<your-64-char-hex>
```

---

## Step 2: Set deployer credentials

The deployer pays gas. Use a different key from the signing key.

```bash
# Option A: Foundry keystore
cast wallet import deployer --interactive
# Then set:
FOUNDRY_ACCOUNT=deployer

# Option B: Private key (must have ETH on Base Sepolia)
DEPLOYER_PRIVATE_KEY=0x<your-deployer-private-key>
```

---

## Step 3: Set RPC URL

```bash
# Base Sepolia (default)
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

# Or use Alchemy/Infura
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/<key>
```

---

## Step 4: Deploy AegisPaymaster

```bash
cd aegis-agent
npm run deploy:paymaster
```

**Output:** `AegisPaymaster deployed to: 0x...`

Add the address to `.env`:

```
AEGIS_PAYMASTER_ADDRESS=0x<deployed-address>
```

---

## Step 5: Fund the paymaster

Deposits 0.05 ETH into the EntryPoint (default). The deployer key pays.

```bash
npm run fund:paymaster
```

Optional: change amount:

```bash
PAYMASTER_FUND_ETH=0.1 npm run fund:paymaster
```

---

## Step 6: Set bundler + run demo

```bash
# Pimlico Base Sepolia (chainId 84532)
BUNDLER_RPC_URL=https://api.pimlico.io/v2/84532/rpc?apikey=<your-pimlico-key>

# Required for demo
DATABASE_URL=postgresql://...

# Skip legitimacy check (demo uses a test wallet)
SKIP_LEGITIMACY_CHECK=true
```

Run the end-to-end demo:

```bash
AEGIS_PAYMASTER_ADDRESS=<deployed> \
AEGIS_PAYMASTER_SIGNING_KEY=<key> \
BUNDLER_RPC_URL=https://api.pimlico.io/v2/84532/rpc?apikey=<key> \
DATABASE_URL=<your-db> \
SKIP_LEGITIMACY_CHECK=true \
npx tsx scripts/demo-e2e.ts
```

Or use `.env` (ensure it's loaded):

```bash
npx dotenv -e .env -- npx tsx scripts/demo-e2e.ts
```

---

## Full .env template

```env
# Signing key (for paymaster approvals)
AEGIS_PAYMASTER_SIGNING_KEY=0x<64-char-hex>

# Deployer (for deploy + fund)
DEPLOYER_PRIVATE_KEY=0x<deployer-key>
# OR: FOUNDRY_ACCOUNT=deployer

# RPC
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

# After deploy
AEGIS_PAYMASTER_ADDRESS=0x<deployed>

# Bundler (Pimlico Base Sepolia)
BUNDLER_RPC_URL=https://api.pimlico.io/v2/84532/rpc?apikey=<key>

# Database (for demo)
DATABASE_URL=postgresql://user:pass@host:5432/db
```

---

## Quick reference

| Step | Command | Required env |
|------|---------|--------------|
| 1 | (generate key) | — |
| 2 | (set deployer) | `DEPLOYER_PRIVATE_KEY` or `FOUNDRY_ACCOUNT` |
| 3 | (set RPC) | `RPC_URL_BASE_SEPOLIA` |
| 4 | `npm run deploy:paymaster` | `AEGIS_PAYMASTER_SIGNING_KEY`, RPC, deployer |
| 5 | `npm run fund:paymaster` | `AEGIS_PAYMASTER_ADDRESS`, RPC, deployer |
| 6 | `npx tsx scripts/demo-e2e.ts` | `AEGIS_PAYMASTER_ADDRESS`, `AEGIS_PAYMASTER_SIGNING_KEY`, `BUNDLER_RPC_URL`, `DATABASE_URL`, `SKIP_LEGITIMACY_CHECK=true` |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Missing AEGIS_PAYMASTER_SIGNING_KEY_ADDRESS` | Set `AEGIS_PAYMASTER_SIGNING_KEY` (private key) — deploy script derives the address |
| `Bundler unavailable` | Check `BUNDLER_RPC_URL`; Pimlico must support Base Sepolia + EntryPoint v0.7 |
| `UserOp not confirmed` | Ensure paymaster is funded; check bundler logs |
| `Protocol not found` | Demo creates `demo-hackathon` protocol; ensure `DATABASE_URL` is correct |
