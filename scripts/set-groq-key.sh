#!/usr/bin/env bash
# Set GROQ_API_KEY in local .env and print Railway CLI commands.
# Usage:
#   GROQ_API_KEY=your_key_from_console.groq.com ./scripts/set-groq-key.sh
#   ./scripts/set-groq-key.sh your_key_from_console.groq.com
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env"

KEY="${GROQ_API_KEY:-$1}"
if [ -z "$KEY" ]; then
  echo "Usage: GROQ_API_KEY=your_key ./scripts/set-groq-key.sh"
  echo "   or: ./scripts/set-groq-key.sh your_key"
  echo "Get a free key at https://console.groq.com"
  exit 1
fi

# Update or append in .env
if [ -f "$ENV_FILE" ]; then
  if grep -q '^GROQ_API_KEY=' "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^GROQ_API_KEY=.*|GROQ_API_KEY=\"$KEY\"|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    echo "Updated GROQ_API_KEY in .env"
  else
    echo "GROQ_API_KEY=\"$KEY\"" >> "$ENV_FILE"
    echo "Appended GROQ_API_KEY to .env"
  fi
else
  echo "GROQ_API_KEY=\"$KEY\"" >> "$ENV_FILE"
  echo "Created .env with GROQ_API_KEY"
fi

echo ""
echo "Railway: set the same key on the worker (and web if it runs the agent):"
echo "  railway link --service aegis-agent-worker"
echo "  railway variables --set \"GROQ_API_KEY=$KEY\""
echo ""
echo "Optional (if aegis-web also needs social LLM):"
echo "  railway link --service aegis-web"
echo "  railway variables --set \"GROQ_API_KEY=$KEY\""
