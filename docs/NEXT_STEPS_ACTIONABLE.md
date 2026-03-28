# Aegis — Actionable Next Steps

> Step-by-step guide to fund, deploy, configure, and run Aegis in LIVE mode.

---

## Prerequisites

- Foundry installed (`forge`, `cast`)
- Node.js 20+, `npm` or `pnpm`
- `.env` configured (copy from `field.env.template`)
- Keystore account `deployer-onetruehomie` with ETH on Base mainnet for deploys
- Agent wallet `0x7B9763b416F89aB9A2468d8E9f041C4542B5612f` — needs ETH for gas sponsorship

---

## Step 1: Fund Agent Wallet

**Goal:** Send 0.05–0.1 ETH to the agent wallet on Base mainnet so it can sponsor transactions.

**Agent wallet:** `0x7B9763b416F89aB9A2468d8E9f041C4542B5612f`

**Options:**

1. **From your own wallet:**
   - Use Base Bridge (https://bridge.base.org) or an exchange to send ETH to Base mainnet
   - Send 0.05–0.1 ETH to `0x7B9763b416F89aB9A2468d8E9f041C4542B5612f`

2. **From another Base wallet:**
   - Use BaseScan, MetaMask, or any wallet to send ETH to the address above

**Verify:**
```bash
cast balance 0x7B9763b416F89aB9A2468d8E9f041C4542B5612f --rpc-url $RPC_URL_BASE
```

---

## Step 2: Deploy AegisAttestationLogger to Base Mainnet

**Goal:** Deploy the attestation logger contract.

**From `aegis-agent/` (uses RPC from .env automatically):**

```bash
cd aegis-agent
./scripts/deploy-attestation-logger.sh
```

**Or manually (ensure .env is loaded first):**

```bash
cd aegis-agent
source .env   # loads RPC_URL_BASE, etc.
forge create contracts/AegisAttestationLogger.sol:AegisAttestationLogger \
  --rpc-url "$RPC_URL_BASE" \
  --account deployer-onetruehomie \
  --constructor-args 0x7B9763b416F89aB9A2468d8E9f041C4542B5612f
```

**Save the deployed address** from the output (e.g. `0x...`).

**Verify on BaseScan:**
```bash
cast call <DEPLOYED_ADDRESS> "aegisAgent()" --rpc-url $RPC_URL_BASE
# Should return 0x7B9763b416F89aB9A2468d8E9f041C4542B5612f
```

---

## Step 3: Deploy AegisDelegationRegistry to Base Mainnet

**Goal:** Deploy the delegation registry (currently only on Sepolia).

**From `aegis-agent/`:**

```bash
# Deploy
forge script script/DeployDelegationRegistry.s.sol:DeployDelegationRegistry \
  --rpc-url $RPC_URL_BASE \
  --broadcast \
  --account deployer-onetruehomie
```

**Save the deployed address** from the broadcast output.

---

## Step 4: Set ATTESTATION_LOGGER_ADDRESS in .env and Vercel

**Goal:** Add the new contract address to config.

**1. Update `.env`:**

```bash
# Add or update:
ATTESTATION_LOGGER_ADDRESS="0x..."   # from Step 2
DELEGATION_REGISTRY_ADDRESS="0x..." # from Step 3 (if different from existing)
```

**2. Add to Vercel env allowed keys:**

Edit `scripts/vercel-env-allowed-keys.txt` and add:
```
ATTESTATION_LOGGER_ADDRESS
```

**3. Sync env to Vercel:**

```bash
cd aegis-agent
npm run vercel:env:sync
```

---

## Step 5: Register EAS Gas Passport Schema

**Goal:** Register the attestation schema on EAS (one-time per chain).

```bash
cd aegis-agent
npm run register:eas-schema
```

**Prerequisites (must be set in .env):**
- `AGENT_NETWORK_ID=base` in .env
- `AGENT_WALLET_ADDRESS` set
- Keystore account with ETH for gas

**After registration:** Add `EAS_GAS_PASSPORT_SCHEMA_UID` to .env (from output).

---

## Step 6: Start Continuous Agent (LIVE Mode)

**Goal:** Run the agent in LIVE mode so it can execute sponsorships.

**1. Set execution mode in `.env`:**

```bash
AGENT_EXECUTION_MODE=LIVE
```

**2. Start the agent:**

```bash
cd aegis-agent
npm run agent:start
```

**Or run once:**

```bash
npm run agent:run
```

**For production:** Run with `pm2`, `systemd`, or Railway so it stays running.

---

## Step 7: Run Discovery (Optional)

**Goal:** Discover ERC-8004 registered agents and sponsor eligible ones.

**Dry run first:**

```bash
cd aegis-agent
npx tsx scripts/discover-and-sponsor-agents.ts --dry-run
```

**Live run (limit 5):**

```bash
npx tsx scripts/discover-and-sponsor-agents.ts --max 5
```

**Full run:**

```bash
npx tsx scripts/discover-and-sponsor-agents.ts
```

**Prerequisites:**
- `AGENT_NETWORK_ID=base` (or `base-sepolia`)
- `ERC8004_NETWORK` set
- Agent wallet funded
- Bundler configured

---

## Step 8: Preview Video

**Goal:** Preview the demo video for Synthesis submission.

```bash
cd aegis-agent/video
npm run preview
```

Opens Remotion Studio at http://localhost:3000. Render with:

```bash
npm run render     # 1920x1080
npm run render:square  # 1080x1080 for Twitter/IG
```

---

## Checklist Summary

| Step | Action | Command / Link |
|------|--------|----------------|
| 1 | Fund agent wallet | Send 0.05–0.1 ETH to `0x7B97...12f` on Base |
| 2 | Deploy AegisAttestationLogger | `forge create ... --constructor-args 0x7B97...12f` |
| 3 | Deploy AegisDelegationRegistry | `forge script script/DeployDelegationRegistry.s.sol ...` |
| 4 | Set ATTESTATION_LOGGER_ADDRESS | Add to .env, vercel-env-allowed-keys.txt, `npm run vercel:env:sync` |
| 5 | Register EAS schema | `npx tsx scripts/register-eas-schema.ts` (create script if needed) |
| 6 | Start agent | `AGENT_EXECUTION_MODE=LIVE npm run agent:start` |
| 7 | Run discovery | `npx tsx scripts/discover-and-sponsor-agents.ts --dry-run` then live |
| 8 | Preview video | `cd video && npm run preview` |

---

## Troubleshooting

- **"Insufficient funds"** — Fund agent wallet (Step 1)
- **"Deploy failed"** — Ensure deployer has ETH on Base mainnet
- **"ATTESTATION_LOGGER_ADDRESS not set"** — Complete Step 4
- **"agent-reserve-check" fails** — Agent wallet needs 0.1+ ETH (or lower `RESERVE_THRESHOLD_ETH` for testing)
- **Vercel sync fails** — Run `npx vercel link` first, ensure logged in
