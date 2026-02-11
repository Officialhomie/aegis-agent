/**
 * Test sponsored transaction using viem's toCoinbaseSmartAccount
 * This uses the built-in support for Coinbase Smart Wallet signatures.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint06Address,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';
import { getKeystoreAccount } from '../src/lib/keystore';

const ACTIVITY_LOGGER_PING_ABI = [
  { inputs: [], name: 'ping', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

async function main() {
  console.log('=== Sponsored Transaction Test v2 (using toCoinbaseSmartAccount) ===\n');

  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('ERROR: COINBASE_BUNDLER_RPC_URL not set');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;
  const smartWalletAddress = '0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f' as `0x${string}`;

  console.log('Configuration:');
  console.log('  Smart Wallet:', smartWalletAddress);
  console.log('  Activity Logger:', activityLoggerAddress);
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

  // Step 3: Create Coinbase Smart Account using viem's built-in support
  console.log('\nStep 2: Creating Coinbase Smart Account...');
  const smartAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [ownerAccount],
    address: smartWalletAddress, // Use existing wallet
  });
  console.log('  Smart Account Address:', smartAccount.address);

  // Step 4: Create bundler client with the smart account
  console.log('\nStep 3: Creating bundler client with paymaster...');
  const bundlerClient = createBundlerClient({
    account: smartAccount,
    client: publicClient,
    transport: http(bundlerRpcUrl),
    paymaster: createPaymasterClient({
      transport: http(bundlerRpcUrl),
    }),
  });

  // Step 5: Build and send the UserOperation
  console.log('\nStep 4: Sending UserOperation...');
  const pingData = encodeFunctionData({
    abi: ACTIVITY_LOGGER_PING_ABI,
    functionName: 'ping',
    args: [],
  });

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

    console.log('  UserOp Hash:', userOpHash);

    // Step 6: Wait for receipt
    console.log('\nStep 5: Waiting for transaction...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 120000,
    });

    console.log('\n========================================');
    console.log('           SUCCESS!');
    console.log('========================================');
    console.log('  Transaction Hash:', receipt.receipt.transactionHash);
    console.log('  Block:', receipt.receipt.blockNumber);
    console.log('  Success:', receipt.success);
    console.log('\n  View on Basescan:');
    console.log(`  https://basescan.org/tx/${receipt.receipt.transactionHash}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg);

    if (msg.includes('AA')) {
      console.log('\n  ERC-4337 Error codes:');
      console.log('  - AA21: Didn\'t pay prefund');
      console.log('  - AA23: Reverted in validation');
      console.log('  - AA24: Signature error');
      console.log('  - AA25: Invalid signature format');
    }
  }
}

main().catch(console.error);
