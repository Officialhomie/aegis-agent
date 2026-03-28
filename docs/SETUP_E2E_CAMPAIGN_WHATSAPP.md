# Setup: E2E Campaign via WhatsApp

Checklist to run **"sponsor the next 10 transactions on base mainnet for uniswap v4"** and get results on WhatsApp. Run everything on your machine so you can enter the keystore password when prompted.

---

## 1. RPC URL (Base mainnet)

**You likely need to change this** if you hit Alchemy "Monthly capacity limit exceeded" (429).

- **Used by:** Preflight, campaign script, paymaster, balance checks.
- **Env vars:** `BASE_RPC_URL` or `RPC_URL_BASE` or `RPC_URL_8453` (one is enough).

**Options:**

- **Alchemy:** If you have headroom, keep current. Else create a new app or upgrade at https://dashboard.alchemy.com.
- **Public / other provider:** Set in `.env`:
  - `BASE_RPC_URL="https://mainnet.base.org"` (public, rate limited), or
  - Another Base mainnet RPC (e.g. QuickNode, Infura, LlamaNodes) and set `BASE_RPC_URL` to that URL.

No code changes; only `.env` updates.

---

## 2. Database (Prisma + schema sync)

Protocol setup and campaign state need the DB schema in sync.

- **Used by:** `setup-uniswap-v4-protocol.ts`, preflight (protocol check), app.
- **Env:** `DATABASE_URL` (already set in your `.env`).

**If you get P2022 "The column (not available) does not exist"** on `ProtocolSponsor`: the DB is missing the Phase 3 columns (`totalGuaranteedUsd`, `guaranteeReserveUsd`). Sync the schema with:

```bash
cd aegis-agent
npx prisma generate
npx prisma db push
```

**Then** run the protocol setup:

```bash
npx tsx scripts/setup-uniswap-v4-protocol.ts
```

If `npx prisma migrate deploy` fails with **P3005** (database schema is not empty), use `npx prisma db push` instead of migrate deploy; it will add only the missing columns without touching migration history.

---

## 3. Keystore (run on your machine, enter password)

You said you’ll run on your machine and enter the password yourself.

- **Used by:** Signing sponsored UserOps (paymaster), preflight “keystore_signing” check.
- **Env:** `KEYSTORE_ACCOUNT`, `KEYSTORE_PASSWORD` (or `CAST_PASSWORD`).

**Ensure:**

1. **Foundry** is installed: `cast --version`.
2. **Keystore** exists: `cast wallet list` shows account `aegis-agent` (or whatever `KEYSTORE_ACCOUNT` is).
3. **Password** is set in `.env` as `KEYSTORE_PASSWORD=...` so scripts can run non-interactively, **or** you run only interactive scripts and type the password when `cast wallet private-key` prompts.

If you prefer not to put the password in `.env`, run the app and campaign script in a terminal where you can type it when prompted (if the code uses interactive `cast`).

---

## 4. Agent / smart wallet addresses

- **Used by:** Balance checks, policy, “agent wallet” in logs.
- **Env:** `AGENT_WALLET_ADDRESS` (EOA that controls the smart wallet) and `SMART_WALLET_ADDRESS` (the smart account that pays gas).

In `.env` you have:

- `SMART_WALLET_ADDRESS="0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f"`
- `AGENT_WALLET_ADDRESS` is set in the block around line 178 (e.g. `0x7B9763b416F89aB9A2468d8E9f041C4542B5612f`).

Ensure **smart wallet has some Base ETH** (for logging / gas). Preflight checks “smart_wallet_balance” against `RESERVE_THRESHOLD_ETH` (default 0.01). Top up the smart wallet on Base if needed.

---

## 5. Bundler / paymaster (Coinbase CDP)

- **Used by:** Submitting sponsored UserOps to Base.
- **Env:** `BUNDLER_PROVIDER=coinbase`, `COINBASE_BUNDLER_RPC_URL="https://api.developer.coinbase.com/rpc/v1/base/..."`.

**Coinbase CDP allowlist (required for sponsorship):**

In Coinbase Developer Portal → your project → Sponsored Transactions / Paymaster, add these **Uniswap V4 Base mainnet** addresses to the allowlist:

- `0x498581ff718922c3f8e6a244956af099b2652b2b` (PoolManager)
- `0x25d093633990dc94bedeed76c8f3cdaa75f3e7d5` (PositionDescriptor)
- `0x7c5f5a4bbd8fd63184577525326123b519429bdc` (PositionManager)
- `0x0d5e0f971ed27fbff6c2837bf31316121532048d` (Quoter)
- `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` (StateView)
- `0x6ff5693b99212da76ad316178a184ab56d299b43` (Universal Router)
- `0x000000000022D473030F116dDEE9F6B43aC78BA3` (Permit2)

Your `.env` already has `ALLOWED_CONTRACT_ADDRESSES` including these; the CDP allowlist is what actually allows the paymaster to sponsor txs to them.

---

## 6. Optional: Blockscout (for “next 10” discovery)

- **Used by:** `observeContractInteractions` in the campaign script (finding recent interactors with Uniswap V4 contracts).
- **Env:** `BLOCKSCOUT_API_URL="https://base.blockscout.com"`. No API key needed for the public Base instance.

If unset, the campaign finds **no candidates** and stays at 0/10. Set it in `.env` (and on Railway via sync or dashboard) so the campaign script can discover wallets that recently interacted with Uniswap V4.

---

## 7. OpenClaw + WhatsApp (for the single command on WhatsApp)

- **Aegis** must be reachable from OpenClaw (e.g. `AEGIS_URL` pointing to your running app).
- **OpenClaw** must be configured for WhatsApp and allowed to call Aegis.

**On your machine:**

1. **Install Aegis skill** (if not already):
   ```bash
   cp -r aegis-agent/openclaw-skills-PR-ready/aegis ~/.openclaw/workspace/skills/aegis
   ```
2. **Point OpenClaw at your Aegis** (in `~/.openclaw/workspace/.env` or equivalent):
   ```bash
   # Local dev:
   AEGIS_URL=http://localhost:3000
   # Or when Aegis is on Railway: use your service public URL, e.g.:
   # AEGIS_URL=https://aegis-agent-worker-production.up.railway.app
   AEGIS_API_KEY=<same as AEGIS_API_KEY in aegis-agent/.env>
   ```
3. **Restart OpenClaw** after any config/skill change:
   ```bash
   openclaw gateway restart
   ```
4. **Allow your number** in OpenClaw WhatsApp config (`~/.openclaw/openclaw.json`): add your number to `channels.whatsapp.allowFrom` in E.164 format (see `docs/OPENCLAW_WHATSAPP_OTHER_NUMBERS.md`).

5. **Verify OpenClaw → Aegis** (optional). Run these in order (Aegis must be running for 2–5):

   **OpenClaw verification commands (exact order):**
   ```bash
   # 1) Start Aegis (if not already)
   cd aegis-agent
   npm run dev
   ```
   In another terminal (with `AEGIS_API_KEY` set, e.g. from `.env`):
   ```bash
   cd aegis-agent
   export AEGIS_API_KEY="<paste from .env>"

   # 2) GET manifest
   curl -s http://localhost:3000/api/openclaw | jq .

   # 3) POST status
   curl -s -X POST http://localhost:3000/api/openclaw \
     -H "Authorization: Bearer $AEGIS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"command":"status","sessionId":"test"}' | jq .

   # 4) POST campaign_status (no active campaign yet)
   curl -s -X POST http://localhost:3000/api/openclaw \
     -H "Authorization: Bearer $AEGIS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"command":"campaign_status","sessionId":"test"}' | jq .
   ```
   Expected: (2) manifest with `commands` including `campaign`, `campaign_status`; (3) `ok: true` and a status message; (4) message like "No active campaign...".

---

## 8. Commands to run (in order)

Run all commands from the **aegis-agent app directory** (the folder that contains `package.json` and `scripts/`). If your shell is in the repo root (parent of that folder), run `cd aegis-agent` first.

**One-time setup:**

```bash
cd aegis-agent   # if not already in the app directory

# 1) Sync DB schema
npx prisma generate
npx prisma migrate deploy

# 2) Register uniswap-v4 protocol and whitelist
npx tsx scripts/setup-uniswap-v4-protocol.ts

# 3) Preflight (RPC, bundler, keystore, DB, protocol)
npx tsx scripts/preflight-check.ts --protocol uniswap-v4
# Or: npm run check:preflight -- --protocol uniswap-v4
```

Fix any preflight failure (RPC, keystore, balance, DB) before running the campaign.

**Start Aegis and run campaign:**

```bash
cd aegis-agent
npm run dev
```

In another terminal, **either**:

- **Via WhatsApp:** Send: **sponsor the next 10 transactions on base mainnet for uniswap v4**  
  Then: **campaign status** for progress/results.

- **Via curl (no WhatsApp):**
  ```bash
  export AEGIS_API_KEY="<your key from .env>"
  curl -s -X POST http://localhost:3000/api/openclaw \
    -H "Authorization: Bearer $AEGIS_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "sponsor the next 10 transactions on base mainnet for uniswap v4", "sessionId": "test-1"}' | jq .
  curl -s -X POST http://localhost:3000/api/openclaw \
    -H "Authorization: Bearer $AEGIS_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "campaign status", "sessionId": "test-1"}' | jq .
  ```

---

## 9. Quick reference: what to change

| Item              | Change? | What to do |
|-------------------|--------|------------|
| **RPC URL**       | Yes if 429 | Set `BASE_RPC_URL` to another Base mainnet RPC (or new Alchemy app). |
| **DB**            | Maybe  | Run `npx prisma migrate deploy` (or `db push`) so schema matches. |
| **Keystore**      | No     | Run on your machine; ensure `cast wallet list` shows account and password works. |
| **Smart wallet**  | Maybe  | Ensure it has ≥ 0.01 ETH on Base (or adjust `RESERVE_THRESHOLD_ETH`). |
| **CDP allowlist** | Yes    | Add the 7 Uniswap V4 addresses above in Coinbase Developer Portal. |
| **OpenClaw**      | Once   | Set `AEGIS_URL` and `AEGIS_API_KEY`, copy skill, allow your WhatsApp number, restart gateway. |

No code changes are required for RPC or keystore; only env and external config.
