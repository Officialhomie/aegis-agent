#!/usr/bin/env bash
# Verify ERC-8004 agent registration on Base mainnet with cast.
# Usage: ./scripts/verify-erc8004-onchain.sh <agentId>
# Example: ./scripts/verify-erc8004-onchain.sh 1

set -e
cd "$(dirname "$0")/.."

AGENT_ID="${1:?Usage: $0 <agentId>}"
RPC_URL="${RPC_URL_BASE:-https://base-mainnet.g.alchemy.com/v2/f_SNCtMgIYAJswII3Y2BkjcSAWMpfNTh}"
IDENTITY_REGISTRY="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"

echo "Token URI:"
cast call "$IDENTITY_REGISTRY" "tokenURI(uint256)(string)" "$AGENT_ID" --rpc-url "$RPC_URL"
echo ""
echo "Owner:"
cast call "$IDENTITY_REGISTRY" "ownerOf(uint256)(address)" "$AGENT_ID" --rpc-url "$RPC_URL"
