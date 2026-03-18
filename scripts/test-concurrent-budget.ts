#!/usr/bin/env npx tsx
/**
 * SEC-1: Concurrent budget deduction test
 *
 * Verifies that 10 concurrent deductProtocolBudget calls result in exactly
 * 10 deductions and correct final balance (no TOCTOU race).
 *
 * Requires: DATABASE_URL, and a protocol with id 'concurrent-test-protocol' and balanceUSD >= 10
 *
 * Run: npx tsx scripts/test-concurrent-budget.ts
 */

import { getPrisma } from '../src/lib/db';
import { deductProtocolBudget } from '../src/lib/agent/execute/paymaster';

const PROTOCOL_ID = 'concurrent-test-protocol';
const CONCURRENT_COUNT = 10;
const AMOUNT_PER_DEDUCTION = 1;

async function main() {
  const db = getPrisma();

  const existing = await db.protocolSponsor.findUnique({
    where: { protocolId: PROTOCOL_ID },
    select: { balanceUSD: true, totalSpent: true, sponsorshipCount: true },
  });

  if (!existing) {
    console.error(
      `Protocol ${PROTOCOL_ID} not found. Create it with balanceUSD >= ${CONCURRENT_COUNT * AMOUNT_PER_DEDUCTION}`
    );
    process.exit(1);
  }

  const initialBalance = existing.balanceUSD;
  const requiredBalance = CONCURRENT_COUNT * AMOUNT_PER_DEDUCTION;
  if (initialBalance < requiredBalance) {
    console.error(
      `Insufficient balance: ${initialBalance} < ${requiredBalance}. Top up protocol ${PROTOCOL_ID}`
    );
    process.exit(1);
  }

  console.log(`Initial balance: ${initialBalance}, running ${CONCURRENT_COUNT} concurrent deductions of ${AMOUNT_PER_DEDUCTION}...`);

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_COUNT }, () =>
      deductProtocolBudget(PROTOCOL_ID, AMOUNT_PER_DEDUCTION)
    )
  );

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  const after = await db.protocolSponsor.findUnique({
    where: { protocolId: PROTOCOL_ID },
    select: { balanceUSD: true, totalSpent: true, sponsorshipCount: true },
  });

  const expectedBalance = initialBalance - successCount * AMOUNT_PER_DEDUCTION;
  const balanceCorrect = after && Math.abs(after.balanceUSD - expectedBalance) < 0.01;
  const countCorrect = after && after.sponsorshipCount === existing.sponsorshipCount + successCount;

  console.log(`Results: ${successCount} succeeded, ${failedCount} failed`);
  console.log(`Final balance: ${after?.balanceUSD} (expected: ${expectedBalance})`);
  console.log(`Sponsorship count: ${after?.sponsorshipCount} (expected: ${existing.sponsorshipCount + successCount})`);

  if (successCount === CONCURRENT_COUNT && balanceCorrect && countCorrect) {
    console.log('PASS: All concurrent deductions succeeded with correct final balance');
    process.exit(0);
  } else {
    console.error('FAIL: Race condition or incorrect accounting detected');
    if (failedCount > 0) {
      console.error('Failed results:', results.filter((r) => !r.success));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
