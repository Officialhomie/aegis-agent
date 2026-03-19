#!/usr/bin/env npx tsx
/**
 * Paymaster signer verification script.
 *
 * Runs signPaymasterApproval with test key and verifies 162-byte output.
 * Requires: AEGIS_PAYMASTER_SIGNING_KEY, AEGIS_PAYMASTER_ADDRESS
 *
 * Run: npx tsx scripts/test-paymaster-signer.ts
 */

import { signPaymasterApproval, decodePaymasterAndData } from '../src/lib/agent/execute/paymaster-signer';

const TEST_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const TEST_ADDRESS = '0x0000000000000000000000000000000000000001';

async function main() {
  process.env.AEGIS_PAYMASTER_SIGNING_KEY = TEST_KEY;
  process.env.AEGIS_PAYMASTER_ADDRESS = TEST_ADDRESS;
  process.env.AGENT_CHAIN_ID = '84532';

  console.log('Testing signPaymasterApproval...');
  const signed = await signPaymasterApproval({
    sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
    nonce: BigInt(0),
    callData: '0xdeadbeef' as `0x${string}`,
    agentTier: 2,
  });

  const byteLength = (signed.paymasterAndData.length - 2) / 2;
  if (byteLength !== 162) {
    console.error(`FAIL: Expected 162 bytes, got ${byteLength}`);
    process.exit(1);
  }

  const decoded = decodePaymasterAndData(signed.paymasterAndData);
  if (decoded.agentTier !== 2) {
    console.error(`FAIL: Expected agentTier 2, got ${decoded.agentTier}`);
    process.exit(1);
  }

  console.log('PASS: signPaymasterApproval returns 162-byte paymasterAndData');
  console.log('  approvalHash:', signed.approvalHash.slice(0, 20) + '...');
  console.log('  validUntil:', signed.validUntil);
  console.log('  validAfter:', signed.validAfter);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
