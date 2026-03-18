#!/usr/bin/env bash
# Deploy AegisAttestationLogger to Base mainnet.
# Loads RPC from .env. Run from aegis-agent/: ./scripts/deploy-attestation-logger.sh

set -e
cd "$(dirname "$0")/.."

# Load RPC URL from .env (avoids sourcing whole file which can have problematic values)
if [ -f .env ]; then
  RPC=$(grep -E '^RPC_URL_BASE=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^BASE_RPC_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^RPC_URL_8453=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
fi
if [ -z "$RPC" ]; then
  echo "Error: No RPC URL. Set RPC_URL_BASE, BASE_RPC_URL, or RPC_URL_8453 in .env"
  exit 1
fi

AGENT="0x7B9763b416F89aB9A2468d8E9f041C4542B5612f"

echo "Deploying AegisAttestationLogger to Base mainnet..."
echo "RPC: ${RPC:0:50}..."
echo "Agent: $AGENT"

# --broadcast MUST come before --constructor-args (Foundry's allow_hyphen_values can consume
# --broadcast as a constructor arg when it appears after --constructor-args).
# Use --constructor-args="$AGENT" (with =) to avoid any parsing ambiguity.
forge create contracts/AegisAttestationLogger.sol:AegisAttestationLogger \
  --broadcast \
  --rpc-url "$RPC" \
  --account deployer-onetruehomie \
  --constructor-args="$AGENT"
