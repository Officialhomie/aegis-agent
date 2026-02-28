#!/usr/bin/env tsx
/**
 * Sync env vars from .env + .env.local to Railway (merged; .env.local wins).
 * Only syncs keys in RAILWAY_SYNC_KEYS. Skips placeholders and Vercel-only vars.
 *
 * Prereqs: railway link in aegis-agent/, Railway CLI logged in.
 * Usage:
 *   npx tsx scripts/sync-railway-env.ts [--dry-run]
 *   npx tsx scripts/sync-railway-env.ts --all-services [--dry-run]   # push to worker + web
 *   npx tsx scripts/sync-railway-env.ts --service aegis-agent-worker --service aegis-web [--dry-run]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const allServices = argv.includes('--all-services');
const serviceIndices = argv
  .map((a, i) => (a === '--service' ? i + 1 : -1))
  .filter((i) => i >= 0 && argv[i]);
const explicitServices: string[] = serviceIndices.map((i) => argv[i]).filter(Boolean);
const DEFAULT_SERVICES = ['aegis-agent-worker', 'aegis-web'];
const services: string[] = explicitServices.length > 0 ? explicitServices : allServices ? DEFAULT_SERVICES : [];

const RAILWAY_SYNC_KEYS = [
  'BASE_RPC_URL',
  'RPC_URL_BASE',
  'RPC_URL_BASE_SEPOLIA',
  'RPC_URL_ETHEREUM',
  'RPC_URL_SEPOLIA',
  'SUPPORTED_CHAINS',
  'ERC8004_NETWORK',
  'ALLOWED_CONTRACT_ADDRESSES',
  'REDIS_URL',
  'BLOCKSCOUT_API_URL',
  'AGENT_EXECUTION_MODE',
  'AGENT_NETWORK_ID',
  'RESERVE_THRESHOLD_ETH',
  'RESERVE_CRITICAL_ETH',
  'TARGET_RESERVE_ETH',
  'GAS_SPONSORSHIP_HEALTH_SKIP_THRESHOLD',
  'ACTIVITY_LOGGER_ADDRESS',
  'REACTIVE_OBSERVER_ADDRESS',
  'REACTIVE_CALLBACK_SECRET',
  'AEGIS_API_KEY',
  'AEGIS_DASHBOARD_URL',
  'USDC_ADDRESS',
  'USDC_ADDRESS_BASE_MAINNET',
  'BUNDLER_PROVIDER',
  'BUNDLER_RPC_URL',
  'COINBASE_BUNDLER_RPC_URL',
  'RESERVE_PIPELINE_INTERVAL_MS',
  'SPONSORSHIP_INTERVAL_MS',
  'LOG_LEVEL',
  'X402_ENABLED',
  'X402_FACILITATOR_URL',
  'X402_MIN_PAYMENT_USD',
  'X402_BASE_FEE_USDC',
  'X402_GAS_MARKUP',
  'X402_EXECUTION_MODE',
];

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

const env = { ...loadEnv(resolve(root, '.env')), ...loadEnv(resolve(root, '.env.local')) };

// Railway worker must be LIVE (local .env.local often has SIMULATION)
if (env.AGENT_EXECUTION_MODE === 'SIMULATION') env.AGENT_EXECUTION_MODE = 'LIVE';

function setVariable(key: string, value: string, service?: string): boolean {
  const pair = `${key}=${value}`;
  const args = service ? ['variables', '--service', service, '--set', pair, '--skip-deploys'] : ['variables', '--set', pair, '--skip-deploys'];
  const result = spawnSync('railway', args, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error(`Failed to set ${key}${service ? ` on ${service}` : ''}:`, result.stderr || result.stdout);
    return false;
  }
  return true;
}

let updated = 0;
for (const key of RAILWAY_SYNC_KEYS) {
  const value = env[key];
  if (value === undefined || value === '' || value.startsWith('<paste-') || value === 'sk-...' || value === '...') continue;
  if (key === 'VERCEL_OIDC_TOKEN') continue;
  if (dryRun) {
    if (services.length > 0) {
      for (const svc of services) console.log(`Would set ${key} on ${svc}=${value.length > 40 ? value.slice(0, 40) + '...' : value}`);
    } else {
      console.log(`Would set ${key}=${value.length > 40 ? value.slice(0, 40) + '...' : value}`);
    }
    updated++;
    continue;
  }
  if (services.length > 0) {
    for (const svc of services) {
      if (setVariable(key, value, svc)) {
        console.log(`Set ${key} on ${svc}`);
        updated++;
      }
    }
  } else {
    if (setVariable(key, value)) {
      console.log(`Set ${key}`);
      updated++;
    }
  }
}
console.log(dryRun ? `[dry-run] Would set ${updated} variable(s).` : `Set ${updated} variable(s).`);
if (services.length > 0 && !dryRun) {
  console.log(`Synced to services: ${services.join(', ')}`);
}
