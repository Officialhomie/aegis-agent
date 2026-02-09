#!/usr/bin/env tsx
/**
 * Sync env vars from local .env to Vercel (production and optionally preview).
 * Only syncs keys listed in scripts/vercel-env-allowed-keys.txt (no private keys).
 *
 * Prereqs:
 *   - Vercel CLI: npm i -g vercel (or npx vercel)
 *   - Linked project: run `vercel link` in aegis-agent/ first
 *
 * Usage:
 *   npx tsx scripts/sync-vercel-env.ts [--dry-run] [--overwrite] [--preview]
 *
 *   --dry-run   Print which keys would be synced (no API calls).
 *   --overwrite Remove existing var on Vercel then add (updates value).
 *   --preview   Also sync to Preview environment (default: Production only).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load .env manually (no dotenv package in ESM scope for script simplicity)
function loadEnv(envPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(envPath)) return out;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
    out[key] = val;
  }
  return out;
}

function loadAllowedKeys(): string[] {
  const path = resolve(root, 'scripts/vercel-env-allowed-keys.txt');
  const content = readFileSync(path, 'utf-8');
  return content
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
}

function runVercel(args: string[], stdin?: string): { ok: boolean; stderr: string; stdout: string } {
  const result = spawnSync('npx', ['vercel', ...args], {
    cwd: root,
    input: stdin,
    encoding: 'utf-8',
    stdio: stdin !== undefined ? ['pipe', 'pipe', 'pipe'] : undefined,
  });
  return {
    ok: result.status === 0,
    stderr: (result.stderr || '').trim(),
    stdout: (result.stdout || '').trim(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const overwrite = args.includes('--overwrite');
  const preview = args.includes('--preview');
  const envPath = resolve(root, '.env');

  const env = loadEnv(envPath);
  const allowed = loadAllowedKeys();

  const toSync = allowed.filter((key) => env[key] !== undefined && env[key] !== '');
  const targets: ('production' | 'preview')[] = ['production'];
  if (preview) targets.push('preview');

  console.log('[sync-vercel-env] Root:', root);
  console.log('[sync-vercel-env] .env keys in allowed list:', toSync.length);
  console.log('[sync-vercel-env] Targets:', targets.join(', '));
  if (dryRun) {
    console.log('[sync-vercel-env] DRY RUN - would sync:', toSync.join(', '));
    return;
  }

  // Check Vercel CLI and link
  const { ok: vercelOk, stderr: vercelStderr } = runVercel(['env', 'ls']);
  if (!vercelOk) {
    console.error('[sync-vercel-env] Vercel CLI failed. Run "vercel link" in aegis-agent/ and ensure "vercel" is installed.');
    console.error(vercelStderr);
    process.exit(1);
  }

  let added = 0;
  const failed: string[] = [];

  for (const key of toSync) {
    const value = env[key];
    for (const target of targets) {
      if (overwrite) {
        runVercel(['env', 'rm', key, target, '--yes']);
      }
      const { ok, stderr } = runVercel(['env', 'add', key, target], value);
      if (ok) {
        added++;
        console.log(`  OK ${key} -> ${target}`);
      } else {
        failed.push(`${key}@${target}`);
        console.error(`  FAIL ${key} -> ${target}:`, stderr);
      }
    }
  }

  console.log('[sync-vercel-env] Done. Added/updated:', added);
  if (failed.length) {
    console.error('[sync-vercel-env] Failed:', failed.join(', '));
    process.exit(1);
  }
}

main();
