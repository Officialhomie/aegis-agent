# ERC-8004 on Base Sepolia

The agent can register on the **ERC-8004 Identity Registry** for on-chain identity. On **Base Sepolia** a registry is deployed and supported by this codebase.

---

## Base Sepolia contract

Official ERC-8004 vanity addresses (see [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)):

| Registry | Address | Explorer |
|----------|---------|----------|
| **Identity Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| **Reputation Registry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |

The identity registry is used for `register(agentURI)` and `setAgentURI(agentId, newURI)`. The reputation registry is used for on-chain feedback (`giveFeedback`, `getSummary`, etc.).

---

## What you need to set (Base Sepolia)

In `.env`:

```env
# Use Base Sepolia for ERC-8004
ERC8004_NETWORK="base-sepolia"

# RPC for Base Sepolia (used for registration tx). Leave empty to use RPC_URL_BASE_SEPOLIA.
ERC8004_RPC_URL=""

# Optional override; if empty, the code uses the built-in Base Sepolia address above.
# ERC8004_IDENTITY_REGISTRY_ADDRESS="0x8004A818BFB912233c491871b3d84c89A494BD9e"
```

Ensure the **agent wallet** has **Base Sepolia ETH** for gas:

- `AGENT_WALLET_ADDRESS` / `EXECUTE_WALLET_PRIVATE_KEY` must be the signer.
- Get testnet ETH from e.g. [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet).

Ensure **RPC** is set for Base Sepolia, e.g.:

```env
RPC_URL_BASE_SEPOLIA="https://sepolia.base.org"
# or your Alchemy/Infura/QuickNode Base Sepolia URL
```

---

## Flow in this repo

1. **Startup:** `ensureAgentRegistered()` runs when you start the agent (`npm run agent:start`).
2. **Conditions:** Runs only if there is an active agent in DB, the agent has no `onChainId` yet, and `getIdentityRegistryAddress()` is set (via `ERC8004_NETWORK=base-sepolia` or `ERC8004_IDENTITY_REGISTRY_ADDRESS`).
3. **Steps:** Build registration file (name, description, image, web/A2A endpoints, x402Support, updatedAt), upload to IPFS (Pinata via `PINATA_JWT` or legacy `IPFS_GATEWAY_URL`; data URI in dev only), call `register(agentURI)` on the identity registry, then re-upload the registration file with the new `agentId` in `registrations` and call `setAgentURI(agentId, newUri)` so the agent is discoverable. On success, the agent’s `onChainId` is stored in the DB.

---

## “gas required exceeds allowance (0)”

This revert usually means:

1. **Insufficient ETH:** The agent wallet has no (or almost no) Base Sepolia ETH. **Fix:** Fund `AGENT_WALLET_ADDRESS` on Base Sepolia.
2. **Wrong chain:** Registration is being sent to a chain where the wallet has no balance. **Fix:** Set `ERC8004_NETWORK=base-sepolia` and use a Base Sepolia RPC so the tx is sent on Base Sepolia.
3. **Contract-specific allowance:** Some deployments use a gas abstraction that requires an “allowance” (e.g. paymaster). The official Base Sepolia registry at `0x8004A818...` is a normal contract; the agent pays gas with its own ETH. So in this setup, (1) or (2) is the usual cause.

After fixing, restart the agent; it will retry registration on the next start.

---

## Logic summary

- **ERC8004_NETWORK** chooses the chain (and, if no override, the registry address): `sepolia` | `base-sepolia` | `base` | `mainnet`.
- **Base Sepolia:** Use `ERC8004_NETWORK=base-sepolia`. The built-in identity address `0x8004A818BFB912233c491871b3d84c89A494BD9e` and reputation address `0x8004B663056A597Dffe9eCcC1965A193B7388713` are used unless you set overrides.
- **RPC:** For `base-sepolia`, the code uses `ERC8004_RPC_URL` if set, otherwise `RPC_URL_BASE_SEPOLIA` or `RPC_URL_84532`.
- **IPFS:** For production, set `PINATA_JWT` (or `IPFS_GATEWAY_URL`) so registration metadata is pinned; otherwise registration will fail in production.
- Registration is **one-time** per agent (until you change URI); after success the agent has `onChainId` and `ensureAgentRegistered()` skips.
