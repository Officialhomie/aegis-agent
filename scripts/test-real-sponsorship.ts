/**
 * Test real paymaster sponsorship - submits an actual UserOperation
 * and returns a transaction hash verifiable on Basescan.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint06Address,
} from 'viem/account-abstraction';

const ACTIVITY_LOGGER_PING_ABI = [
  { inputs: [], name: 'ping', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

const EXECUTE_ABI = [
  {
    inputs: [
      { name: 'dest', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'func', type: 'bytes' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

async function main() {
  console.log('=== Real Sponsorship Test ===\n');

  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('ERROR: COINBASE_BUNDLER_RPC_URL not set');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;
  if (!activityLoggerAddress) {
    console.error('ERROR: ACTIVITY_LOGGER_ADDRESS not set');
    process.exit(1);
  }

  // IMPORTANT: Use the Coinbase Smart Wallet that works with CDP
  const sender = '0xbdA97b283f9C93C1EA025b6240f299D81E6c0823' as `0x${string}`;
  const entryPoint = entryPoint06Address; // v0.6 for Coinbase Smart Wallet

  console.log('Configuration:');
  console.log('  Sender (Coinbase Smart Wallet):', sender);
  console.log('  Activity Logger:', activityLoggerAddress);
  console.log('  Entry Point:', entryPoint, '(v0.6)');
  console.log('  Bundler RPC:', bundlerRpcUrl.replace(/[a-zA-Z0-9]{20,}/, '***'));
  console.log();

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const bundlerClient = createBundlerClient({
    transport: http(bundlerRpcUrl),
    chain: base,
  });

  const paymasterClient = createPaymasterClient({
    transport: http(bundlerRpcUrl),
  });

  // Get current nonce for the sender
  console.log('Step 1: Getting sender nonce...');
  let nonce = BigInt(0);
  try {
    const nonceResult = await publicClient.readContract({
      address: entryPoint,
      abi: [{
        name: 'getNonce',
        inputs: [{ type: 'address' }, { type: 'uint192' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      }],
      functionName: 'getNonce',
      args: [sender, BigInt(0)],
    });
    nonce = nonceResult as bigint;
    console.log('  Nonce:', nonce.toString());
  } catch (e) {
    console.log('  Could not get nonce, using 0');
  }

  // Build calldata - ping the ActivityLogger
  console.log('\nStep 2: Building calldata...');
  const pingData = encodeFunctionData({
    abi: ACTIVITY_LOGGER_PING_ABI,
    functionName: 'ping',
    args: [],
  });

  const callData = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [activityLoggerAddress, BigInt(0), pingData],
  });
  console.log('  CallData:', callData.slice(0, 50) + '...');

  // Get current gas prices from Base - use ACTUAL network prices
  console.log('\nStep 3: Getting gas prices from network...');
  const gasPrice = await publicClient.getGasPrice();
  const block = await publicClient.getBlock();
  const baseFee = block.baseFeePerGas ?? BigInt(1000000); // 0.001 gwei fallback

  // Use 2x base fee for maxFeePerGas, and small priority fee
  const maxFeePerGas = baseFee * BigInt(2);
  const maxPriorityFeePerGas = BigInt(100000); // 0.0001 gwei - minimal priority

  console.log('  Base Fee:', (Number(baseFee) / 1e9).toFixed(6), 'gwei');
  console.log('  Max Fee Per Gas:', (Number(maxFeePerGas) / 1e9).toFixed(6), 'gwei');
  console.log('  Max Priority Fee:', (Number(maxPriorityFeePerGas) / 1e9).toFixed(6), 'gwei');

  // Reasonable gas limits for a simple ping
  const callGasLimit = BigInt(100000);
  const verificationGasLimit = BigInt(100000);
  const preVerificationGas = BigInt(50000);

  // Estimate sponsorship cost
  const totalGas = callGasLimit + verificationGasLimit + preVerificationGas;
  const maxCostWei = totalGas * maxFeePerGas;
  const maxCostETH = Number(maxCostWei) / 1e18;
  const ethPrice = 2500; // Approximate
  const maxCostUSD = maxCostETH * ethPrice;
  console.log('  Total Gas:', totalGas.toString());
  console.log('  Estimated Max Cost:', maxCostUSD.toFixed(4), 'USD');

  if (maxCostUSD > 50) {
    console.error('\n  ERROR: Estimated cost exceeds CDP $50 limit!');
    console.error('  Try lowering gas prices or limits.');
    process.exit(1);
  }

  // Build the UserOperation
  console.log('\nStep 4: Building UserOperation...');
  const userOp = {
    sender,
    nonce,
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: '0x' as `0x${string}`, // Dummy signature - paymaster will handle
  };

  // Get paymaster data
  console.log('\nStep 5: Requesting paymaster sponsorship...');
  try {
    const paymasterResult = await paymasterClient.getPaymasterStubData({
      chainId: base.id,
      entryPointAddress: entryPoint,
      ...userOp,
    });

    console.log('  Paymaster responded!');
    if ('paymasterAndData' in paymasterResult) {
      console.log('  paymasterAndData:', (paymasterResult.paymasterAndData as string).slice(0, 50) + '...');
      (userOp as any).paymasterAndData = paymasterResult.paymasterAndData;
    }
    if ('sponsor' in paymasterResult) {
      console.log('  Sponsor:', (paymasterResult as any).sponsor?.name || 'Unknown');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR getting paymaster data:', msg.slice(0, 300));
    process.exit(1);
  }

  // Submit the UserOperation - format values as hex strings for JSON-RPC
  console.log('\nStep 6: Submitting UserOperation to bundler...');
  const toHex = (n: bigint) => '0x' + n.toString(16);
  const userOpFormatted = {
    sender,
    nonce: toHex(nonce),
    callData,
    callGasLimit: toHex(callGasLimit),
    verificationGasLimit: toHex(verificationGasLimit),
    preVerificationGas: toHex(preVerificationGas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    signature: '0x',
    paymasterAndData: (userOp as any).paymasterAndData,
  };

  try {
    const userOpHash = await bundlerClient.request({
      method: 'eth_sendUserOperation' as any,
      params: [userOpFormatted, entryPoint] as any,
    }) as `0x${string}`;

    console.log('  UserOp submitted!');
    console.log('  UserOp Hash:', userOpHash);

    // Wait for the receipt
    console.log('\nStep 7: Waiting for transaction receipt...');
    const startTime = Date.now();
    const timeout = 120000; // 2 minutes

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await bundlerClient.request({
          method: 'eth_getUserOperationReceipt' as any,
          params: [userOpHash] as any,
        }) as any;

        if (receipt) {
          console.log('\n=== SUCCESS ===');
          console.log('  Transaction Hash:', receipt.receipt.transactionHash);
          console.log('  Block Number:', parseInt(receipt.receipt.blockNumber, 16));
          console.log('  Gas Used:', parseInt(receipt.actualGasUsed, 16));
          console.log('  Success:', receipt.success);
          console.log('\n  View on Basescan:');
          console.log(`  https://basescan.org/tx/${receipt.receipt.transactionHash}`);
          return;
        }
      } catch {
        // Receipt not ready yet
      }

      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n  Timeout waiting for receipt. Check manually:');
    console.log(`  https://jiffyscan.xyz/userOpHash/${userOpHash}?network=base`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR submitting UserOp:', msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
