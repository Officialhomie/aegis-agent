#!/usr/bin/env bash
# Register Aegis agent on ERC-8004 Identity Registry (Base mainnet) and print verification commands.
# Requires: .env with AEGIS_API_KEY (or pass AEGIS_API_KEY=...), and either running app or deployed URL.
#
# Usage (run from aegis-agent app root, e.g. cd aegis-agent first if you're in workspace root):
#   cd aegis-agent && ./scripts/register-erc8004-and-verify.sh
#   BASE_URL=http://localhost:3000 ./scripts/register-erc8004-and-verify.sh
#
# After registration, run the printed cast commands to verify on-chain.

set -e
cd "$(dirname "$0")/.."

# Load AEGIS_API_KEY from .env if not set
if [ -z "$AEGIS_API_KEY" ] && [ -f .env ]; then
  export AEGIS_API_KEY=$(grep '^AEGIS_API_KEY=' .env | sed 's/^AEGIS_API_KEY=//' | tr -d '"' | tr -d "'")
fi
if [ -z "$AEGIS_API_KEY" ]; then
  echo "Error: AEGIS_API_KEY not set. Set it in .env or pass AEGIS_API_KEY=..."
  exit 1
fi

BASE_URL="${BASE_URL:-https://ClawGas.vercel.app}"
# Default RPC; script may override from response registry (Sepolia vs mainnet)
RPC_URL="${RPC_URL_BASE:-https://base-mainnet.g.alchemy.com/v2/f_SNCtMgIYAJswII3Y2BkjcSAWMpfNTh}"

echo "Registering agent via $BASE_URL/api/agent/register ..."
RESP=$(curl -s -S -X POST "$BASE_URL/api/agent/register" \
  -H "Authorization: Bearer $AEGIS_API_KEY" \
  -H "Content-Type: application/json") || true

if [ -z "$RESP" ]; then
  echo "Error: No response from server. Try BASE_URL=http://localhost:3000 with 'npm run dev' running."
  exit 1
fi
if echo "$RESP" | grep -q '"error"'; then
  echo "Registration failed:"
  echo "$RESP" | head -5
  exit 1
fi

AGENT_ID=$(echo "$RESP" | sed -n 's/.*"agentId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$AGENT_ID" ]; then
  AGENT_ID=$(echo "$RESP" | sed -n 's/.*"agentId"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
fi
# Use registry from response so verify commands match the chain that was used
IDENTITY_REGISTRY=$(echo "$RESP" | sed -n 's/.*"registryAddress"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$IDENTITY_REGISTRY" ]; then
  IDENTITY_REGISTRY="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
fi
# Base Sepolia registry => use Base Sepolia RPC for verify
if [ "$IDENTITY_REGISTRY" = "0x8004A818BFB912233c491871b3d84c89A494BD9e" ]; then
  RPC_URL="${RPC_URL_BASE_SEPOLIA:-https://base-sepolia.g.alchemy.com/v2/f_SNCtMgIYAJswII3Y2BkjcSAWMpfNTh}"
fi
# If response was "already registered" with no txHash, agentId may be from the other chain
ALREADY_REGISTERED=
echo "$RESP" | grep -q '"message"[[:space:]]*:[[:space:]]*"Agent already registered"' && ALREADY_REGISTERED=1

echo ""
echo "Registration response: $RESP"
echo ""
if [ -z "$AGENT_ID" ]; then
  echo "Could not parse agentId from response. Verify manually."
  exit 1
fi

echo "Agent registered with agentId: $AGENT_ID (registry: $IDENTITY_REGISTRY)"
if [ -n "$ALREADY_REGISTERED" ]; then
  echo ""
  echo "Note: This agentId was registered earlier. If you had ERC8004_NETWORK=base-sepolia then,"
  echo "      verify on Base Sepolia instead: registry 0x8004A818BFB912233c491871b3d84c89A494BD9e and Base Sepolia RPC."
fi
echo ""
echo "Run these commands to verify on-chain (requires cast):"
echo ""
echo "# Token URI (should return ipfs://...)"
echo "cast call $IDENTITY_REGISTRY 'tokenURI(uint256)(string)' $AGENT_ID --rpc-url $RPC_URL"
echo ""
echo "# Owner (should be agent wallet 0x7B9763b416F89aB9A2468d8E9f041C4542B5612f)"
echo "cast call $IDENTITY_REGISTRY 'ownerOf(uint256)(address)' $AGENT_ID --rpc-url $RPC_URL"
