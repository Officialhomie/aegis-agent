#!/usr/bin/env npx tsx
/**
 * Update Moltbook agent name/description, or re-register with new credentials.
 *
 * Usage:
 *   npx tsx scripts/update-moltbook.ts
 *   npx tsx scripts/update-moltbook.ts --name "Aegis" --description "Autonomous gas sponsorship agent..."
 *
 * If the Moltbook API supports PATCH /agents/me, the profile is updated in place.
 * Otherwise, re-register with: npx tsx scripts/register-moltbook.ts --name X --description Y
 * then set the new MOLTBOOK_API_KEY in .env.
 */

import 'dotenv/config';
import { getMoltbookProfile, updateMoltbookProfile } from '../src/lib/agent/social/moltbook';

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

  if (!process.env.MOLTBOOK_API_KEY?.trim()) {
    console.error('[Moltbook] MOLTBOOK_API_KEY not set. Run: npx tsx scripts/register-moltbook.ts');
    process.exit(1);
  }

  console.log('[Moltbook] Current profile:');
  try {
    const profile = await getMoltbookProfile();
    console.log('  name:', profile.name);
    console.log('  description:', (profile.description ?? '').slice(0, 80) + (profile.description && profile.description.length > 80 ? '...' : ''));
    console.log('');
  } catch (err) {
    console.error('[Moltbook] Could not fetch profile:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('[Moltbook] Attempting to update profile via PATCH /agents/me...');
  try {
    const updated = await updateMoltbookProfile({ name, description });
    console.log('[Moltbook] Profile updated successfully.');
    console.log('  name:', updated.name);
    console.log('  description:', (updated.description ?? '').slice(0, 80) + (updated.description && updated.description.length > 80 ? '...' : ''));
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404') || msg.includes('Method Not Allowed') || msg.includes('Moltbook API error')) {
      console.log('[Moltbook] Update endpoint not available. To change name/description, re-register:');
      console.log('  npx tsx scripts/register-moltbook.ts --name "' + name + '" --description "' + description.slice(0, 50) + '..."');
      console.log('  Then set the new MOLTBOOK_API_KEY in .env (old key will stop working for the old profile).');
      return;
    }
    console.error('[Moltbook] Update failed:', msg);
    process.exit(1);
  }
}

main();
