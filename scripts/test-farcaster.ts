/**
 * Test Farcaster posting (Neynar SDK).
 * Run after setting NEYNAR_API_KEY and FARCASTER_SIGNER_UUID in .env.
 *
 * Usage: npx tsx scripts/test-farcaster.ts
 */

import 'dotenv/config';
import { postSponsorshipProof, postDailyStats } from '../src/lib/agent/social/farcaster';
import type { SignedDecision } from '../src/lib/agent/execute/paymaster';
import type { Decision } from '../src/lib/agent/reason/schemas';

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  const signerUuid = process.env.FARCASTER_SIGNER_UUID ?? process.env.NEYNAR_SIGNER_UUID;

  if (!apiKey || !signerUuid) {
    console.error('Set NEYNAR_API_KEY and FARCASTER_SIGNER_UUID (or NEYNAR_SIGNER_UUID) in .env');
    console.error('Get keys from https://neynar.com');
    process.exit(1);
  }

  console.log('[Test] Posting sample sponsorship proof...');

  const mockDecision: Decision = {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Test cast from Aegis paymaster integration.',
    parameters: {
      userAddress: '0x0000000000000000000000000000000000000001',
      protocolId: 'test-protocol',
      maxGasLimit: 200000,
      estimatedCostUSD: 0.12,
    },
  };

  const signed: SignedDecision = {
    decision: mockDecision,
    decisionHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    signature: '0x00' as `0x${string}`,
    decisionJSON: JSON.stringify(mockDecision),
  };

  const result = await postSponsorshipProof(signed, {
    success: true,
    sponsorshipHash: undefined,
    decisionHash: signed.decisionHash,
    simulationResult: { action: 'SPONSOR_TRANSACTION', userAddress: '0x...1', protocolId: 'test-protocol' },
  });

  if (result.success) {
    console.log('[Test] Sponsorship proof posted:', result.castHash ?? 'OK');
  } else {
    console.error('[Test] Failed:', result.error);
    process.exit(1);
  }

  console.log('[Test] Posting sample daily stats...');
  const statsResult = await postDailyStats({
    sponsorshipsToday: 0,
    activeProtocols: 0,
    reserveETH: 0.5,
    totalGasSavedUSD: 0,
    uniqueUsers: 0,
  });

  if (statsResult.success) {
    console.log('[Test] Daily stats posted:', statsResult.castHash ?? 'OK');
  } else {
    console.error('[Test] Daily stats failed:', statsResult.error);
  }

  console.log('[Test] Farcaster integration OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
