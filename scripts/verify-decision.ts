/**
 * CLI: Verify a decision hash (on-chain + signature).
 * Usage: npx tsx scripts/verify-decision.ts <decisionHash>
 */

import { verifyDecisionChain } from '../src/lib/verify-decision';

async function main() {
  const decisionHash = process.argv[2]?.trim();
  if (!decisionHash) {
    console.error('Usage: npx tsx scripts/verify-decision.ts <decisionHash>');
    process.exit(1);
  }

  const result = await verifyDecisionChain(decisionHash);
  console.log(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  process.exit(result.onChain && result.signatureValid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
