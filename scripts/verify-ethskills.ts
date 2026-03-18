/**
 * Verify ETHSKILLS integration.
 * Fetches all skills, validates addresses, and prints summary.
 */

import 'dotenv/config';
import {
  fetchAllEthSkills,
  getEthSkillsReasoningContext,
  getGasThresholds,
  validateAddressesAgainstEthSkills,
  parseGasThresholds,
} from '../src/lib/ethskills';

async function main() {
  console.log('='.repeat(60));
  console.log('ETHSKILLS Integration Verification');
  console.log('='.repeat(60));

  console.log('\n[1] Fetching all ETHSKILLS...');
  const cache = await fetchAllEthSkills();
  console.log('  Keys:', Object.keys(cache.content));
  console.log('  Gas length:', cache.content.gas?.length ?? 0, 'chars');
  console.log('  Wallets length:', cache.content.wallets?.length ?? 0, 'chars');
  console.log('  Standards length:', cache.content.standards?.length ?? 0, 'chars');
  console.log('  L2s length:', cache.content.l2s?.length ?? 0, 'chars');
  console.log('  Addresses length:', cache.content.addresses?.length ?? 0, 'chars');

  console.log('\n[2] Gas thresholds (parsed from ETHSKILLS + env):');
  const thresholds = await getGasThresholds();
  console.log('  gasRejectGwei:', thresholds.gasRejectGwei);
  console.log('  costRejectUsd:', thresholds.costRejectUsd);
  console.log('  parsed:', thresholds.parsed);

  console.log('\n[3] Parsed thresholds from raw gas content:');
  const parsed = parseGasThresholds(cache.content.gas);
  console.log('  gasRejectGwei:', parsed.gasRejectGwei);
  console.log('  costRejectUsd:', parsed.costRejectUsd);
  console.log('  parsed:', parsed.parsed);

  console.log('\n[4] Address validation:');
  const addrResult = await validateAddressesAgainstEthSkills();
  console.log('  valid:', addrResult.valid);
  if (addrResult.mismatches.length > 0) {
    console.log('  mismatches:', addrResult.mismatches);
  }

  console.log('\n[5] Reasoning context (first 500 chars):');
  const ctx = await getEthSkillsReasoningContext();
  console.log(ctx.slice(0, 500) + '...');

  console.log('\n' + '='.repeat(60));
  console.log('ETHSKILLS verification complete');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
