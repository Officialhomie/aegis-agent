/**
 * CLI entry point for the unified Aegis agent (Reserve Pipeline + Gas Sponsorship).
 * Runs both modes: reserve pipeline every 5 min, gas sponsorship every 1 min.
 *
 * Usage: npm run agent:start
 * Or: npx tsx scripts/run-agent.ts
 */

import 'dotenv/config';
// #region agent log
fetch('http://127.0.0.1:7248/ingest/d6915d2c-7cdc-4e4d-9879-2c5523431d83',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'run-agent.ts:after dotenv',message:'env check',data:{cwd:process.cwd(),hasDatabaseUrl:!!process.env.DATABASE_URL},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
// #endregion
import { startAutonomousPaymaster } from '../src/lib/agent';

function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.EXECUTE_WALLET_PRIVATE_KEY?.trim()) missing.push('EXECUTE_WALLET_PRIVATE_KEY');
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
