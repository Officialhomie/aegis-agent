# x402 Environment Variables – Using Coinbase CDP

This doc breaks down the **x402-related env vars** and how to get them when you use **Coinbase CDP** (or another facilitator).

---

## What x402 is and what the vars do

**x402** is an HTTP payment protocol: a client pays for an API call (e.g. “sponsor this gas”) by sending a payment proof; your app **verifies** that proof with a **facilitator**, then runs the paid action.

| Env var | Purpose |
|--------|---------|
| **X402_ENABLED** | `"true"` = accept and verify x402 payments; `"false"` = ignore x402. |
| **X402_FACILITATOR_URL** | Base URL of the facilitator API. Your app calls `{X402_FACILITATOR_URL}/verify` to verify payments. |
| **X402_API_KEY** | Optional. Static Bearer token sent to the facilitator when it requires auth. **Not used for CDP** (CDP uses JWT – see below). |
| **X402_MIN_PAYMENT_USD** | Minimum payment (USD) to accept. |
| **X402_BASE_FEE_USDC** | Base fee in USDC (e.g. `0.001`). |
| **X402_GAS_MARKUP** | Gas cost markup (e.g. `1.1`). |
| **X402_EXECUTION_MODE** | `SIMULATION` = don’t execute on-chain; `LIVE` = execute after verification. |

---

## Two ways to run x402

1. **Generic facilitator (e.g. x402.org)** – You get an API key from them and use a simple verify API. The app’s current code is built for this.
2. **Coinbase CDP as facilitator** – You use your **existing CDP API key**; auth is a **JWT** generated from that key, not a separate “x402 API key.”

---

## Option A: Generic facilitator (e.g. x402.org)

Use this if you want to use a third-party facilitator that exposes a simple “verify” API and gives you a static API key.

### Step 1: Get the facilitator URL and API key

1. Go to the facilitator’s site (e.g. [x402.org](https://x402.org)).
2. Sign up / log in and find **API** or **Developer** or **Facilitator**.
3. Copy:
   - **Facilitator base URL** (e.g. `https://x402.org/facilitator`). Your app will call `{base}/verify`.
   - **API key** (if they require auth).

### Step 2: Set in `.env`

```bash
X402_ENABLED="true"
X402_FACILITATOR_URL="https://x402.org/facilitator"
X402_API_KEY="your-api-key-from-facilitator"
X402_MIN_PAYMENT_USD="1"
X402_BASE_FEE_USDC="0.001"
X402_GAS_MARKUP="1.1"
X402_EXECUTION_MODE="SIMULATION"
```

For production paid execution, set `X402_EXECUTION_MODE="LIVE"` when ready.

---

## Option B: Coinbase CDP as the x402 facilitator

Coinbase CDP provides an **x402 Facilitator API** (verify + settle). You do **not** get a separate “x402 API key”; you use your **existing CDP project** and **Secret API Key**.

### What you already have (from AgentKit / CDP)

You already set these for the agent and AgentKit:

- **CDP_API_KEY_NAME** – API key ID (e.g. UUID from the CDP portal).
- **CDP_API_KEY_PRIVATE_KEY** – Secret (base64) for that key.

Same project, same keys can be used for the CDP x402 Facilitator.

### CDP x402 API details

- **Base URL:** `https://api.cdp.coinbase.com`
- **Verify:** `POST https://api.cdp.coinbase.com/platform/v2/x402/verify`
- **Settle:** `POST https://api.cdp.coinbase.com/platform/v2/x402/settle`
- **Auth:** **Bearer JWT** generated from your **CDP Secret API Key** (per request). Not a static `X402_API_KEY`.

So for CDP:

- **X402_FACILITATOR_URL** should point at the **path prefix** your app uses to build “/verify”.  
  The app currently does `fetch(\`${X402_FACILITATOR_URL}/verify\`, ...)`. So you can set:
  - `X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402"`  
  so that the app calls `https://api.cdp.coinbase.com/platform/v2/x402/verify`.
- **X402_API_KEY:** Leave **empty** when using CDP. Auth is done with a **JWT** signed with `CDP_API_KEY_NAME` + `CDP_API_KEY_PRIVATE_KEY`.

### How to get / confirm your CDP credentials (for x402)

1. **Open CDP Portal**  
   https://portal.cdp.coinbase.com  

2. **Project & Secret API Key**  
   - Select the **same project** you use for AgentKit.  
   - Go to **API Keys** (or **Projects** → your project → API Keys).  
   - Under **Secret API Keys**:  
     - **Create** a key if you don’t have one, or use the one you already use for AgentKit.  
     - Copy:  
       - **Key ID** (UUID) → use as **CDP_API_KEY_NAME**.  
       - **Key Secret** (long base64 string) → use as **CDP_API_KEY_PRIVATE_KEY**.  
   - Do **not** put the secret in client-side code or in public env templates.

3. **Use in `.env`**  
   You already have:
   ```bash
   CDP_API_KEY_NAME="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   CDP_API_KEY_PRIVATE_KEY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX=="
   ```  
   For x402 with CDP you **don’t** add a separate `X402_API_KEY`. Set:
   ```bash
   X402_ENABLED="true"
   X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402"
   X402_API_KEY=""
   X402_MIN_PAYMENT_USD="1"
   X402_BASE_FEE_USDC="0.001"
   X402_GAS_MARKUP="1.1"
   X402_EXECUTION_MODE="SIMULATION"
   ```

### Built-in CDP adapter

The app includes an **x402 CDP adapter** (`src/lib/agent/payments/x402-cdp-adapter.ts`). When **X402_FACILITATOR_URL** points to CDP (`api.cdp.coinbase.com`):

- **Verify** uses CDP’s `/platform/v2/x402/verify` with **JWT** auth (from **CDP_API_KEY_NAME** + **CDP_API_KEY_PRIVATE_KEY**).
- **Client** must send the **full x402 payment payload** (CDP shape: `x402Version`, `scheme`, `network`, `payload` with signature + authorization) in the **X-PAYMENT** or **PAYMENT-SIGNATURE** header. The middleware accepts this and builds the proof with `cdpPaymentPayload`; the adapter then calls CDP verify and maps `{ isValid, payer }` to the app’s `VerifiedPayment` shape.

So for **env vars** when using CDP:

- Set **X402_FACILITATOR_URL** to:  
  `https://api.cdp.coinbase.com/platform/v2/x402`
- Leave **X402_API_KEY** empty (auth is via CDP JWT).
- Keep **CDP_API_KEY_NAME** and **CDP_API_KEY_PRIVATE_KEY** set; the adapter uses them to generate the JWT.

---

## Summary table

| If you use…           | X402_FACILITATOR_URL                          | X402_API_KEY        | Other |
|----------------------|------------------------------------------------|----------------------|-------|
| **x402.org**         | `https://x402.org/facilitator`                | Their API key        | -     |
| **Coinbase CDP**     | `https://api.cdp.coinbase.com/platform/v2/x402` | Leave empty          | Auth via CDP JWT (same CDP keys); may need adapter in app |

---

## Checklist (Coinbase CDP path)

- [ ] Same CDP project as AgentKit; Secret API Key created in [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com).
- [ ] `CDP_API_KEY_NAME` and `CDP_API_KEY_PRIVATE_KEY` set in `.env` (no separate x402 key).
- [ ] `X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402"`.
- [ ] `X402_API_KEY=""` (or omitted).
- [ ] Other x402 vars set as needed: `X402_ENABLED`, `X402_MIN_PAYMENT_USD`, `X402_BASE_FEE_USDC`, `X402_GAS_MARKUP`, `X402_EXECUTION_MODE`.
- [ ] Clients send the **full x402 payment payload** (CDP format) in the **X-PAYMENT** or **PAYMENT-SIGNATURE** header so the adapter can verify via CDP.

---

*Doc aligns with CDP x402 Facilitator (verify/settle) and Aegis x402 CDP adapter. Last updated 2026-02-09.*
