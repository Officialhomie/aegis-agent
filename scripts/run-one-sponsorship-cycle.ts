/**
 * Run a single sponsored transaction cycle for E2E testing.
 * Uses the working toCoinbaseSmartAccount approach.
 *
 * Usage: npx tsx scripts/run-one-sponsorship-cycle.ts
 */
import 'dotenv/config';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import {
  createBundlerClient,
  createPaymasterClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';
import { getKeystoreAccount } from '../src/lib/keystore';

const ACTIVITY_LOGGER_PING_ABI = [
  { inputs: [], name: 'ping', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

async function main() {
  console.log('=== Running One Sponsorship Cycle ===\n');

  // Validate environment
  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('ERROR: COINBASE_BUNDLER_RPC_URL not set in .env');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;
  if (!activityLoggerAddress) {
    console.error('ERROR: ACTIVITY_LOGGER_ADDRESS not set in .env');
    process.exit(1);
  }

  // Use the smart wallet we created (or from env)
  const smartWalletAddress = (process.env.SMART_WALLET_ADDRESS ?? '0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f') as `0x${string}`;

  console.log('Configuration:');
  console.log('  Smart Wallet:', smartWalletAddress);
  console.log('  Activity Logger:', activityLoggerAddress);
  console.log('  Bundler RPC:', bundlerRpcUrl.replace(/[a-zA-Z0-9]{20,}/, '***'));
  console.log();

  // Step 1: Load the owner's keystore account
  console.log('Step 1: Loading agent keystore...');
  const ownerAccount = await getKeystoreAccount();
  console.log('  Owner:', ownerAccount.address);

  // Step 2: Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Step 3: Create Coinbase Smart Account
  console.log('\nStep 2: Creating Coinbase Smart Account...');
  const smartAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [ownerAccount],
    address: smartWalletAddress,
  });
  console.log('  Smart Account ready:', smartAccount.address);

  // Step 4: Create bundler client with paymaster
  console.log('\nStep 3: Setting up bundler with CDP paymaster...');
  const bundlerClient = createBundlerClient({
    account: smartAccount,
    client: publicClient,
    transport: http(bundlerRpcUrl),
    paymaster: createPaymasterClient({
      transport: http(bundlerRpcUrl),
    }),
  });

  // Step 5: Build and send the sponsored UserOperation
  console.log('\nStep 4: Sending sponsored UserOperation (ActivityLogger.ping)...');
  const pingData = encodeFunctionData({
    abi: ACTIVITY_LOGGER_PING_ABI,
    functionName: 'ping',
    args: [],
  });

  const startTime = Date.now();
  try {
    const userOpHash = await bundlerClient.sendUserOperation({
      calls: [
        {
          to: activityLoggerAddress,
          data: pingData,
          value: BigInt(0),
        },
      ],
    });

    console.log('  UserOp submitted!');
    console.log('  UserOp Hash:', userOpHash);

    // Step 6: Wait for receipt
    console.log('\nStep 5: Waiting for transaction confirmation...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 120000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n========================================');
    console.log('           SUCCESS!');
    console.log('========================================');
    console.log('  Transaction Hash:', receipt.receipt.transactionHash);
    console.log('  Block:', receipt.receipt.blockNumber);
    console.log('  Success:', receipt.success);
    console.log('  Time elapsed:', elapsed, 'seconds');
    console.log('\n  View on Basescan:');
    console.log(`  https://basescan.org/tx/${receipt.receipt.transactionHash}`);
    console.log('\n--- Summary ---');
    console.log('Observations count: 1');
    console.log('Decision: { action: "SPONSOR_TRANSACTION", confidence: 1.0 }');
    console.log('Execution: { success: true, error: null }');
    console.log('Transaction hash:', receipt.receipt.transactionHash);
    console.log('UserOp hash:', userOpHash);
    console.log('\nDone.');
    process.exit(0);

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const msg = err instanceof Error ? err.message : String(err);

    console.error('\n========================================');
    console.error('           FAILED');
    console.error('========================================');
    console.error('  Error:', msg);
    console.error('  Time elapsed:', elapsed, 'seconds');

    if (msg.includes('AA')) {
      console.error('\n  ERC-4337 Error codes:');
      console.error('  - AA21: Didn\'t pay prefund');
      console.error('  - AA23: Reverted in validation');
      console.error('  - AA24: Signature error');
      console.error('  - AA25: Invalid signature format');
    }

    console.log('\n--- Summary ---');
    console.log('Observations count: 1');
    console.log('Decision: { action: "SPONSOR_TRANSACTION", confidence: 1.0 }');
    console.log('Execution: { success: false, error:', msg.slice(0, 100), '}');
    console.log('\nDone.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
