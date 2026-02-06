#!/usr/bin/env node
/**
 * Parse .env and output railway variables --set args (one per line KEY=VALUE).
 * Skip comments, empty values, and REDIS_URL (set as reference in dashboard).
 * Usage: node scripts/set-railway-vars.js | while IFS= read -r line; do railway variables --set "$line"; done
 * Or: railway variables --set "$(node scripts/set-railway-vars.js | head -1)"
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const content = fs.readFileSync(envPath, 'utf8');

const skipKeys = new Set(['REDIS_URL']);
const lines = content.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (skipKeys.has(key)) continue;
  if (value === '') continue;
  value = value.replace(/^["']|["']$/g, '');
  if (value === '') continue;
  console.log(key + '=' + value);
}
