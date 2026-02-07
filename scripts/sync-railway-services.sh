#!/bin/bash
# Railway Services Sync Script
# Helps verify and sync environment variables between aegis-agent-worker and aegis-web

set -e

echo "🚂 Railway Services Sync Tool"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not installed${NC}"
    echo "Install: npm i -g @railway/cli"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI found${NC}"
echo ""

# Function to check service health
check_service_health() {
    local service=$1
    local url=$2

    echo -e "${BLUE}Checking $service health...${NC}"

    if [ -z "$url" ]; then
        echo -e "${YELLOW}⚠️  No public URL for $service${NC}"
        return 1
    fi

    # Check health endpoint
    if curl -s "$url/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $service is responding${NC}"
        return 0
    else
        echo -e "${RED}❌ $service is not responding${NC}"
        return 1
    fi
}

# Function to check Redis connection
check_redis() {
    local url=$1

    echo -e "${BLUE}Checking Redis connection...${NC}"

    if [ -z "$url" ]; then
        echo -e "${YELLOW}⚠️  No URL provided${NC}"
        return 1
    fi

    local response=$(curl -s "$url/api/health/redis")
    if echo "$response" | grep -q '"redis":"connected"'; then
        echo -e "${GREEN}✅ Redis is connected${NC}"
        return 0
    else
        echo -e "${RED}❌ Redis connection failed${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to list missing variables
compare_variables() {
    echo -e "${BLUE}Comparing environment variables...${NC}"
    echo ""

    # Get worker variables
    echo "Fetching worker variables..."
    railway variables --service aegis-agent-worker --json > /tmp/worker-vars.json 2>/dev/null || {
        echo -e "${RED}❌ Failed to fetch worker variables${NC}"
        echo "Make sure you're linked to the Railway project"
        exit 1
    }

    # Get web variables
    echo "Fetching web variables..."
    railway variables --service aegis-web --json > /tmp/web-vars.json 2>/dev/null || {
        echo -e "${RED}❌ Failed to fetch web variables${NC}"
        exit 1
    }

    # Compare
    echo ""
    echo -e "${YELLOW}Variables in WORKER but not in WEB:${NC}"
    comm -23 \
        <(jq -r 'keys[]' /tmp/worker-vars.json | sort | grep -v "RAILWAY_" | grep -v "EXECUTE_WALLET_PRIVATE_KEY" | grep -v "KEYSTORE_" | grep -v "DEPLOYER_" | grep -v "FOUNDRY_") \
        <(jq -r 'keys[]' /tmp/web-vars.json | sort) \
        | while read var; do
            echo "  - $var"
        done

    echo ""
    echo -e "${YELLOW}Variables in WEB but not in WORKER:${NC}"
    comm -13 \
        <(jq -r 'keys[]' /tmp/worker-vars.json | sort) \
        <(jq -r 'keys[]' /tmp/web-vars.json | sort) \
        | while read var; do
            echo "  - $var"
        done

    echo ""

    # Cleanup
    rm -f /tmp/worker-vars.json /tmp/web-vars.json
}

# Function to verify KeyGuard state
check_keyguard() {
    local service=$1
    local expected_mode=$2
    local expected_can_sign=$3

    echo -e "${BLUE}Checking KeyGuard state for $service...${NC}"

    # Link to service
    railway link --service "$service" > /dev/null 2>&1 || {
        echo -e "${RED}❌ Failed to link to $service${NC}"
        return 1
    }

    # Check logs for KeyGuard messages
    local logs=$(railway logs --limit 100 2>/dev/null | grep -E "KeyGuard|Mode:|Signing capability:")

    if echo "$logs" | grep -q "Mode: $expected_mode"; then
        echo -e "${GREEN}✅ Mode: $expected_mode${NC}"
    else
        echo -e "${RED}❌ Expected Mode: $expected_mode${NC}"
    fi

    if [ "$expected_can_sign" = "YES" ]; then
        if echo "$logs" | grep -q "Signing capability: YES"; then
            echo -e "${GREEN}✅ Signing capability: YES${NC}"
        else
            echo -e "${RED}❌ Signing capability should be YES${NC}"
        fi
    else
        if echo "$logs" | grep -q "Signing capability: NO\|canSign.*false"; then
            echo -e "${GREEN}✅ Signing capability: NO (expected)${NC}"
        else
            echo -e "${YELLOW}⚠️  Signing capability state unclear${NC}"
        fi
    fi
}

# Main menu
echo "Select an option:"
echo "1. Compare environment variables"
echo "2. Check service health"
echo "3. Check Redis connection"
echo "4. Check KeyGuard state"
echo "5. Full system check"
echo "6. Exit"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
    1)
        compare_variables
        ;;
    2)
        echo ""
        WEB_URL="https://aegis-web-production.up.railway.app"
        check_service_health "aegis-web" "$WEB_URL"
        ;;
    3)
        echo ""
        WEB_URL="https://aegis-web-production.up.railway.app"
        check_redis "$WEB_URL"
        ;;
    4)
        echo ""
        echo "Checking worker (should have LIVE + signing)..."
        check_keyguard "aegis-agent-worker" "LIVE" "YES"
        echo ""
        echo "Checking web (should have SIMULATION + no signing)..."
        check_keyguard "aegis-web" "SIMULATION" "NO"
        ;;
    5)
        echo ""
        echo "Running full system check..."
        echo "=============================="
        echo ""

        # 1. Compare variables
        compare_variables
        echo ""

        # 2. Check web health
        WEB_URL="https://aegis-web-production.up.railway.app"
        check_service_health "aegis-web" "$WEB_URL"
        echo ""

        # 3. Check Redis
        check_redis "$WEB_URL"
        echo ""

        # 4. Check KeyGuard states
        echo "Checking KeyGuard states..."
        echo "---"
        check_keyguard "aegis-agent-worker" "LIVE" "YES"
        echo ""
        check_keyguard "aegis-web" "SIMULATION" "NO"
        echo ""

        echo -e "${GREEN}✅ Full system check complete${NC}"
        ;;
    6)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo "Done!"
