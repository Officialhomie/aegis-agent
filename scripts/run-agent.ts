/**
 * CLI entry point for the unified Aegis agent (Reserve Pipeline + Gas Sponsorship).
 * Runs both modes: reserve pipeline every 5 min, gas sponsorship every 1 min.
 *
 * Usage: npm run agent:start
 * Or: npx tsx scripts/run-agent.ts
 */

import 'dotenv/config';
import { startAutonomousPaymaster } from '../src/lib/agent';

/** True if agent wallet is configured via keystore or env private key (same logic as getKeystoreAccount). */
function hasWalletConfigured(): { ok: true; source: string } | { ok: false } {
  const keystoreAccount = process.env.KEYSTORE_ACCOUNT?.trim();
  const password = process.env.KEYSTORE_PASSWORD ?? process.env.CAST_PASSWORD;
  if (keystoreAccount && password !== undefined && password !== '') {
    return { ok: true, source: 'keystore' };
  }
  if (process.env.EXECUTE_WALLET_PRIVATE_KEY?.trim()) {
    return { ok: true, source: 'EXECUTE_WALLET_PRIVATE_KEY' };
  }
  if (process.env.AGENT_PRIVATE_KEY?.trim()) {
    return { ok: true, source: 'AGENT_PRIVATE_KEY' };
  }
  return { ok: false };
}

function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const wallet = hasWalletConfigured();
  if (!wallet.ok) missing.push('EXECUTE_WALLET_PRIVATE_KEY or KEYSTORE_ACCOUNT+KEYSTORE_PASSWORD or AGENT_PRIVATE_KEY');
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
  const wallet = hasWalletConfigured();
  const env = validateEnv();
  if (!env.ok) {
    console.error('[RunAgent] Missing required env:', env.missing.join(', '));
    process.exit(1);
  }
  if (wallet.ok) {
    console.log('[RunAgent] Wallet configured via:', wallet.source);
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
