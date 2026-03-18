#!/usr/bin/env npx tsx
/**
 * SEC-2: Nonce collision test
 *
 * Verifies that getNonce returns the correct nonce from EntryPoint for a sender.
 * Run 5 sequential getNonce calls - each should return the same value (no sponsorship yet).
 *
 * Requires: BASE_RPC_URL or RPC_URL_BASE, and a valid sender address
 *
 * Run: npx tsx scripts/test-nonce-collision.ts [senderAddress]
 */

import { getNonce } from '../src/lib/agent/execute/nonce-manager';

const DEFAULT_SENDER = '0x0000000000000000000000000000000000000001' as `0x${string}`;

async function main() {
  const sender = (process.argv[2] as `0x${string}`) ?? DEFAULT_SENDER;

  console.log(`Fetching nonce for sender ${sender} (5 sequential calls)...`);

  const nonces: bigint[] = [];
  for (let i = 0; i < 5; i++) {
    const nonce = await getNonce(sender);
    nonces.push(nonce);
    console.log(`  Call ${i + 1}: nonce = ${nonce.toString()}`);
  }

  const allSame = nonces.every((n) => n === nonces[0]);
  if (allSame) {
    console.log('PASS: All 5 calls returned consistent nonce (no collision)');
    process.exit(0);
  } else {
    console.error('FAIL: Inconsistent nonces detected:', nonces.map(String));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error('Ensure BASE_RPC_URL or RPC_URL_BASE is set');
  process.exit(1);
});
