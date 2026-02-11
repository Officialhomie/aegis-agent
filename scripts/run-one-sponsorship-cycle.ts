/**
 * Run a single sponsorship cycle for E2E testing.
 * Loads .env, runs runSponsorshipCycle() once, and prints observations count, decision, execution result, and tx/userOp hashes.
 *
 * Usage: npx tsx scripts/run-one-sponsorship-cycle.ts
 * Or:    dotenv -e .env -- npx tsx scripts/run-one-sponsorship-cycle.ts
 */
import 'dotenv/config';
import { runSponsorshipCycle } from '../src/lib/agent';

async function main() {
  console.log('Running one sponsorship cycle...\n');
  const state = await runSponsorshipCycle();
  const observationsCount = state.observations?.length ?? 0;
  const decision = state.currentDecision;
  const execution = state.executionResult as
    | (typeof state.executionResult & { transactionHash?: string; userOpHash?: string; sponsorshipHash?: string })
    | null;

  console.log('--- Summary ---');
  console.log('Observations count:', observationsCount);
  console.log('Decision:', decision ? { action: decision.action, confidence: decision.confidence } : null);
  console.log('Execution:', execution ? { success: execution.success, error: execution.error } : null);
  if (execution) {
    if (execution.transactionHash) console.log('Transaction hash:', execution.transactionHash);
    if (execution.userOpHash) console.log('UserOp hash:', execution.userOpHash);
    if (execution.sponsorshipHash && execution.sponsorshipHash !== execution.transactionHash)
      console.log('Sponsorship hash:', execution.sponsorshipHash);
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
