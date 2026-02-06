/**
 * CLI entry point for the unified Aegis agent (Reserve Pipeline + Gas Sponsorship).
 * Runs both modes: reserve pipeline every 5 min, gas sponsorship every 1 min.
 *
 * Usage: npm run agent:start
 * Or: npx tsx scripts/run-agent.ts
 */

import 'dotenv/config';
import { startAutonomousPaymaster } from '../src/lib/agent';
import { initializeKeyGuard, getKeyGuardState } from '../src/lib/key-guard';

function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const useClaude = process.env.USE_CLAUDE_REASONING === 'true';
  if (useClaude) {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) missing.push('ANTHROPIC_API_KEY');
  } else {
    if (!process.env.OPENAI_API_KEY?.trim()) missing.push('OPENAI_API_KEY');
  }
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

  // Initialize KeyGuard - checks key availability without throwing
  console.log('[RunAgent] Initializing KeyGuard...');
  const keyGuardState = await initializeKeyGuard();

  console.log('[RunAgent] Agent configuration:');
  console.log(`  Mode: ${keyGuardState.mode}`);
  console.log(`  Signing capability: ${keyGuardState.canSign ? 'YES' : 'NO'}`);
  if (keyGuardState.canSign) {
    console.log(`  Wallet: ${keyGuardState.address} (via ${keyGuardState.method})`);
  } else {
    console.log('  Running in read-only mode - signing operations will be skipped');
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
