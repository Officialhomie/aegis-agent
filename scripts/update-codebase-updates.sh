#!/usr/bin/env bash
# Append a dated entry to CODEBASE_UPDATES.md (auto context for Claude/Cursor).
# Usage:
#   ./scripts/update-codebase-updates.sh              # from session edits file
#   ./scripts/update-codebase-updates.sh --from-files [path]
#   ./scripts/update-codebase-updates.sh --from-git
# Requires: run from project root (aegis-agent) or repo root; jq optional for --from-git.

set -e

# Find CODEBASE_UPDATES.md (project root = aegis-agent where package.json lives)
ROOT="${CLAUDE_PROJECT_DIR:-.}"
if [ -n "$GIT_DIR" ] || [ -d "$ROOT/.git" ]; then
  REPO_ROOT="${GIT_ROOT:-$(cd "$ROOT" && git rev-parse --show-toplevel 2>/dev/null || true)}"
fi
if [ -f "$ROOT/CODEBASE_UPDATES.md" ]; then
  UPDATES_FILE="$ROOT/CODEBASE_UPDATES.md"
elif [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/aegis-agent/CODEBASE_UPDATES.md" ]; then
  UPDATES_FILE="$REPO_ROOT/aegis-agent/CODEBASE_UPDATES.md"
  ROOT="$REPO_ROOT/aegis-agent"
elif [ -f "aegis-agent/CODEBASE_UPDATES.md" ]; then
  UPDATES_FILE="aegis-agent/CODEBASE_UPDATES.md"
  ROOT="aegis-agent"
else
  echo "CODEBASE_UPDATES.md not found" >&2
  exit 1
fi

DATE=$(date +%Y-%m-%d)

append_entry() {
  local body="$1"
  [ ! -f "$UPDATES_FILE" ] && return
  LINE=$(grep -n '^## Recent entries$' "$UPDATES_FILE" | head -1 | cut -d: -f1)
  [ -z "$LINE" ] && return
  # Insert after "## Recent entries" and the following newline
  N=$((LINE + 1))
  head -n "$((N - 1))" "$UPDATES_FILE" > "$UPDATES_FILE.new"
  echo "- **$DATE** (auto) — $body" >> "$UPDATES_FILE.new"
  echo "" >> "$UPDATES_FILE.new"
  tail -n "+$N" "$UPDATES_FILE" >> "$UPDATES_FILE.new"
  mv "$UPDATES_FILE.new" "$UPDATES_FILE"
}

if [ "$1" = "--from-git" ]; then
  # Append from last commit (run from repo root, e.g. post-commit hook)
  TOPLEVEL=$(cd "$ROOT" && git rev-parse --show-toplevel 2>/dev/null || true)
  [ -z "$TOPLEVEL" ] && exit 0
  FILES=$(cd "$TOPLEVEL" && git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
  MSG=$(cd "$TOPLEVEL" && git log -1 --pretty=format:"%s" 2>/dev/null || true)
  [ -z "$FILES" ] && exit 0
  append_entry "Git commit: $MSG. Files: $FILES"
  exit 0
fi

EDITS_FILE="$ROOT/.claude/last-session-edits.txt"
[ "$1" = "--from-files" ] && [ -n "$2" ] && EDITS_FILE="$2"

if [ ! -f "$EDITS_FILE" ] || [ ! -s "$EDITS_FILE" ]; then
  exit 0
fi

# Dedupe and collapse paths
FILES=$(sort -u "$EDITS_FILE" | grep -v '^$' | tr '\n' ', ' | sed 's/,$//')
[ -z "$FILES" ] && rm -f "$EDITS_FILE" && exit 0

append_entry "Files touched (Claude Code session): $FILES"
rm -f "$EDITS_FILE"
exit 0
