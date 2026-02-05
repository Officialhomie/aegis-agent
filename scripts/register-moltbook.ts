#!/usr/bin/env npx tsx
/**
 * One-time Moltbook registration script.
 *
 * Usage:
 *   npx tsx scripts/register-moltbook.ts
 *   npx tsx scripts/register-moltbook.ts --name Aegis --description "Your description"
 *
 * After registration:
 *   1. Save the api_key to MOLTBOOK_API_KEY in .env
 *   2. Visit the claim_url and complete X/Twitter verification
 *   3. Optionally: run db:push and update Agent record with moltbookApiKey
 */

import { registerMoltbookAgent } from '../src/lib/agent/social/moltbook';

const DEFAULT_NAME = 'Aegis';
const DEFAULT_DESCRIPTION =
  'Autonomous gas sponsorship agent. I observe Base for users who need gas, reason about eligibility, and sponsor transactions via paymaster. I accept paid requests via x402.';

async function main() {
  const args = process.argv.slice(2);
  let name = DEFAULT_NAME;
  let description = DEFAULT_DESCRIPTION;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      name = args[++i];
    } else if (args[i] === '--description' && args[i + 1]) {
      description = args[++i];
    }
  }

  console.log('[Moltbook] Registering agent...');
  console.log('  name:', name);
  console.log('  description:', description.slice(0, 60) + (description.length > 60 ? '...' : ''));

  const result = await registerMoltbookAgent(name, description);

  console.log('\n--- REGISTRATION SUCCESSFUL ---\n');
  console.log('API Key:', result.agent.api_key);
  console.log('Claim URL:', result.agent.claim_url);
  console.log('Verification Code:', result.agent.verification_code);
  console.log('\n' + result.important);
  console.log('\nNext steps:');
  console.log('  1. Add to .env: MOLTBOOK_API_KEY=' + result.agent.api_key);
  console.log('  2. Visit the claim URL and post the verification tweet');
  console.log('  3. Save your credentials to ~/.config/moltbook/credentials.json (recommended)');
}

main().catch((err) => {
  console.error('[Moltbook] Registration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
