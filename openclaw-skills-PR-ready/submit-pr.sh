#!/usr/bin/env bash
# Run this after: gh auth login
# Fork, push, and create PR for Aegis skill

set -e

cd "$(dirname "$0")"

echo "Forking BankrBot/openclaw-skills (adds fork as remote, no clone)..."
gh repo fork BankrBot/openclaw-skills --clone=false --remote=true
# Fork exists as Officialhomie/openclaw-skills; gh adds it as origin, renames upstream

echo "Pushing add-aegis-skill branch to your fork..."
git push origin add-aegis-skill

echo "Creating PR..."
gh pr create --repo BankrBot/openclaw-skills --base main --head "$(gh api user -q .login):add-aegis-skill" \
  --title "Add Aegis skill: autonomous gas sponsorship agent on Base" \
  --body "Adds the Aegis skill for Moltbot/Clawdbot — autonomous gas sponsorship agent on Base.

- Gas sponsorship for AI agents via ERC-4337 paymasters
- Protocol budget management and x402 payments
- ERC-8004 identity and reputation attestations
- Transparency proofs to Farcaster and Moltbook

Includes:
- SKILL.md with frontmatter, quick start, usage examples
- Full API reference (22+ endpoints)
- Integration guide (protocol registration, sponsorship, webhooks)
- Helper scripts: aegis-health.sh, aegis-sponsor.sh"

echo "Done. PR created."
