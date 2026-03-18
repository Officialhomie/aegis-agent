#!/usr/bin/env bash
# Deploy AegisDelegationRegistry via forge script.
# Loads RPC from .env. Run from aegis-agent/: ./scripts/deploy-delegation-registry.sh
# For Base Sepolia, set RPC_URL_BASE_SEPOLIA in .env (or RPC_URL_BASE for mainnet).

set -e
cd "$(dirname "$0")/.."

# Load RPC URL from .env
if [ -f .env ]; then
  RPC=$(grep -E '^RPC_URL_BASE=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^RPC_URL_BASE_SEPOLIA=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^BASE_RPC_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^RPC_URL_8453=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$RPC" ] && RPC=$(grep -E '^RPC_URL_84532=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
fi
if [ -z "$RPC" ]; then
  echo "Error: No RPC URL. Set RPC_URL_BASE, RPC_URL_BASE_SEPOLIA, BASE_RPC_URL, or RPC_URL_8453/84532 in .env"
  exit 1
fi

echo "Deploying AegisDelegationRegistry..."
echo "RPC: ${RPC:0:50}..."

# --broadcast MUST come before other flags to avoid Foundry parsing ambiguity.
forge script script/DeployDelegationRegistry.s.sol:DeployDelegationRegistry \
  --broadcast \
  --rpc-url "$RPC" \
  --account deployer-onetruehomie

echo ""
echo "Add to .env: DELEGATION_REGISTRY_ADDRESS=<deployed address from output above>"
