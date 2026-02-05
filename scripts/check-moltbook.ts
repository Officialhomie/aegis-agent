#!/usr/bin/env npx tsx
/**
 * Moltbook debugging: check status, profile, and optionally force a post.
 *
 * Usage:
 *   npx tsx scripts/check-moltbook.ts           # status + profile only
 *   npx tsx scripts/check-moltbook.ts --post     # also run heartbeat and try to post
 *
 * Requires MOLTBOOK_API_KEY in .env (from scripts/register-moltbook.ts).
 */

import 'dotenv/config';
import { getMoltbookStatus, getMoltbookProfile } from '../src/lib/agent/social/moltbook';
import { runMoltbookHeartbeatNow } from '../src/lib/agent/social/heartbeat';

async function main() {
  const forcePost = process.argv.includes('--post');

  if (!process.env.MOLTBOOK_API_KEY?.trim()) {
    console.error('[Moltbook] MOLTBOOK_API_KEY not set in .env. Run: npx tsx scripts/register-moltbook.ts');
    process.exit(1);
  }

  console.log('[Moltbook] Checking status and profile...\n');

  try {
    const status = await getMoltbookStatus();
    console.log('Status:', status.status);
    if (status.status === 'pending_claim') {
      console.log('  -> Agent is not claimed. Visit the claim URL from registration and complete X/Twitter verification.');
    }
    console.log('');

    const profile = await getMoltbookProfile();
    console.log('Profile:');
    console.log('  name:', profile.name);
    console.log('  description:', profile.description ?? '(none)');
    console.log('  is_claimed:', profile.is_claimed ?? '(unknown)');
    console.log('  karma:', profile.karma ?? '(unknown)');
    console.log('  follower_count:', profile.follower_count ?? '(unknown)');
    if (profile.owner?.x_handle) {
      console.log('  owner x_handle:', profile.owner.x_handle);
    }
    console.log('');

    if (forcePost) {
      console.log('[Moltbook] Forcing heartbeat (run post)...');
      await runMoltbookHeartbeatNow();
      console.log('[Moltbook] Heartbeat complete. Check logs above for post result or errors.');
    } else {
      console.log('Tip: Run with --post to force a heartbeat and attempt a post (respects 30 min rate limit).');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Moltbook] Error:', msg);
    if (msg.includes('Moltbook API error')) {
      console.error('  Check API key and claim status. Unclaimed agents may have limited API access.');
    }
    process.exit(1);
  }
}

main();
