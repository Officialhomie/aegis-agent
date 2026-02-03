/**
 * CLI entry point for the unified Aegis agent (Reserve Pipeline + Gas Sponsorship).
 * Runs both modes: reserve pipeline every 5 min, gas sponsorship every 1 min.
 *
 * Usage: npm run agent:start
 * Or: npx tsx scripts/run-agent.ts
 */

import 'dotenv/config';
import { startAutonomousPaymaster } from '../src/lib/agent';

const REQUIRED_ENV = ['EXECUTE_WALLET_PRIVATE_KEY', 'OPENAI_API_KEY'] as const;

function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

async function main() {
  console.log('[RunAgent] Validating environment...');
  const env = validateEnv();
  if (!env.ok) {
    console.error('[RunAgent] Missing required env:', env.missing.join(', '));
    process.exit(1);
  }

  const intervalMs = Number(process.env.SPONSORSHIP_INTERVAL_MS ?? 60000);
  console.log('[RunAgent] Starting unified agent (Reserve Pipeline + Gas Sponsorship)', {
    sponsorshipIntervalMs: intervalMs,
    reserveIntervalMs: Number(process.env.RESERVE_PIPELINE_INTERVAL_MS) || 300000,
  });

  await startAutonomousPaymaster(intervalMs);
}

main().catch((err) => {
  console.error('[RunAgent] Fatal error:', err);
  process.exit(1);
});
