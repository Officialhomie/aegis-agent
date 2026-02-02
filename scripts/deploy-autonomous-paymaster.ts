/**
 * Deploy / run the autonomous Base paymaster in LIVE mode.
 * Validates required env vars, then starts startAutonomousPaymaster(60000).
 *
 * Usage: npm run agent:paymaster
 * Or: npx tsx scripts/deploy-autonomous-paymaster.ts
 */

import 'dotenv/config';
import { startAutonomousPaymaster } from '../src/lib/agent';

const REQUIRED_ENV = [
  'EXECUTE_WALLET_PRIVATE_KEY',
  'OPENAI_API_KEY',
] as const;

const OPTIONAL_BUT_RECOMMENDED = [
  'ACTIVITY_LOGGER_ADDRESS',
  'AGENT_WALLET_ADDRESS',
  'BASE_RPC_URL',
  'NEYNAR_API_KEY',
  'FARCASTER_SIGNER_UUID',
  'FARCASTER_FID',
] as const;

function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  const unset = OPTIONAL_BUT_RECOMMENDED.filter((key) => !process.env[key]?.trim());
  if (unset.length > 0) {
    console.warn('[Deploy] Optional env not set (some features may be limited):', unset.join(', '));
  }
  return { ok: true };
}

async function main() {
  console.log('[Deploy] Validating environment...');
  const env = validateEnv();
  if (!env.ok) {
    console.error('[Deploy] Missing required env:', env.missing.join(', '));
    process.exit(1);
  }

  const intervalMs = Number(process.env.PAYMASTER_INTERVAL_MS ?? 60000);
  console.log('[Deploy] Starting autonomous Base paymaster (LIVE mode)', { intervalMs });

  await startAutonomousPaymaster(intervalMs);
}

main().catch((err) => {
  console.error('[Deploy] Fatal error:', err);
  process.exit(1);
});
