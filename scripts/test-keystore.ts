/**
 * Keystore Verification Script
 * Tests that KEYSTORE_ACCOUNT and KEYSTORE_PASSWORD are properly configured
 * and can successfully load the wallet.
 *
 * Usage: npx tsx scripts/test-keystore.ts
 */

import 'dotenv/config';
import { checkKeystoreAvailability } from '../src/lib/keystore';
import { initializeKeyGuard } from '../src/lib/key-guard';

async function main() {
  console.log('🔐 Keystore Verification Script\n');
  console.log('==========================================');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`  KEYSTORE_ACCOUNT: ${process.env.KEYSTORE_ACCOUNT ? '✅ Set' : '❌ Not set'}`);
  console.log(`  KEYSTORE_PASSWORD: ${process.env.KEYSTORE_PASSWORD ? '✅ Set (hidden)' : '❌ Not set'}`);
  console.log(`  EXECUTE_WALLET_PRIVATE_KEY: ${process.env.EXECUTE_WALLET_PRIVATE_KEY ? '⚠️  Set (not recommended)' : '✅ Not set'}`);
  console.log(`  AGENT_MODE: ${process.env.AGENT_MODE || 'SIMULATION (default)'}\n`);

  // Test keystore availability
  console.log('==========================================');
  console.log('🔍 Testing Keystore Availability...\n');

  try {
    const keystoreStatus = await checkKeystoreAvailability();

    console.log('📊 Keystore Status:');
    console.log(`  Available: ${keystoreStatus.available ? '✅ YES' : '❌ NO'}`);
    console.log(`  Method: ${keystoreStatus.method}`);

    if (keystoreStatus.available) {
      console.log(`  Address: ${keystoreStatus.address}`);
      console.log(`\n✅ SUCCESS: Keystore loaded successfully!`);
    } else {
      console.log(`  Error: ${keystoreStatus.error}`);
      console.log(`\n❌ FAILED: Could not load keystore`);
      console.log('\n💡 Troubleshooting:');
      console.log('  1. Make sure Foundry is installed: curl -L https://foundry.paradigm.xyz | bash');
      console.log('  2. Check that the keystore account exists: cast wallet list');
      console.log('  3. Verify the account name matches KEYSTORE_ACCOUNT');
      console.log('  4. Ensure KEYSTORE_PASSWORD is correct');
    }
  } catch (error) {
    console.error('\n❌ ERROR during keystore check:', error);
    process.exit(1);
  }

  // Test KeyGuard initialization
  console.log('\n==========================================');
  console.log('🛡️  Testing KeyGuard Initialization...\n');

  try {
    const keyGuardState = await initializeKeyGuard();

    console.log('📊 KeyGuard State:');
    console.log(`  Mode: ${keyGuardState.mode}`);
    console.log(`  Can Sign: ${keyGuardState.canSign ? '✅ YES' : '❌ NO'}`);
    console.log(`  Method: ${keyGuardState.method}`);

    if (keyGuardState.canSign) {
      console.log(`  Address: ${keyGuardState.address}`);
      console.log(`\n✅ SUCCESS: KeyGuard initialized with signing capability!`);
    } else {
      console.log(`\n⚠️  WARNING: KeyGuard initialized in read-only mode (no signing)`);
      console.log('  The agent will run but cannot sign transactions or log on-chain.');
    }
  } catch (error) {
    console.error('\n❌ ERROR during KeyGuard initialization:', error);
    process.exit(1);
  }

  console.log('\n==========================================');
  console.log('✅ Verification Complete!\n');

  // Railway deployment notes
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log('🚂 RAILWAY DETECTED');
    console.log('  Make sure to set these in Railway environment variables:');
    console.log('  - KEYSTORE_ACCOUNT (same as local)');
    console.log('  - KEYSTORE_PASSWORD (use Railway secrets)');
    console.log('  - AGENT_MODE=LIVE (for full signing capability)\n');
  } else {
    console.log('📝 FOR RAILWAY DEPLOYMENT:');
    console.log('  1. Go to Railway project settings → Variables');
    console.log('  2. Add: KEYSTORE_ACCOUNT=aegis-agent');
    console.log('  3. Add: KEYSTORE_PASSWORD=<your-password> (mark as secret)');
    console.log('  4. Add: AGENT_MODE=LIVE');
    console.log('  5. Ensure Foundry is available in Railway (use nixpacks or Dockerfile)\n');
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
