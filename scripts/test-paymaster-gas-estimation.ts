/**
 * Direct test of paymaster gas estimation fix
 * This bypasses the database to test the gas estimation changes directly.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { createPaymasterClient, getPaymasterStubData, entryPoint07Address, entryPoint06Address } from 'viem/account-abstraction';

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
  console.log('Testing paymaster gas estimation fix...\n');

  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('COINBASE_BUNDLER_RPC_URL not set');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;
  if (!activityLoggerAddress) {
    console.error('ACTIVITY_LOGGER_ADDRESS not set');
    process.exit(1);
  }

  // Test sender - must be a Coinbase Smart Wallet for CDP paymaster to work
  // Using the Coinbase Smart Wallet address provided by the user
  const testSender = '0xbdA97b283f9C93C1EA025b6240f299D81E6c0823' as `0x${string}`;

  // The sender wallet uses EntryPoint v0.6, not v0.7!
  const entryPointAddress = entryPoint06Address; // 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

  console.log('Configuration:');
  console.log('  Bundler RPC:', bundlerRpcUrl.replace(/[a-zA-Z0-9]{20,}/, '***'));
  console.log('  Activity Logger:', activityLoggerAddress);
  console.log('  Test Sender:', testSender);
  console.log('  Entry Point:', entryPointAddress, '(v0.6)');
  console.log();

  // Build calldata for ActivityLogger ping
  const pingData = encodeFunctionData({
    abi: ACTIVITY_LOGGER_PING_ABI,
    functionName: 'ping',
    args: [],
  });

  const callDataActivityLogger = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [activityLoggerAddress, BigInt(0), pingData],
  });

  console.log('CallData (ActivityLogger ping):', callDataActivityLogger.slice(0, 66) + '...');

  // Also try with a simple ETH transfer to self (no target contract)
  const callDataSelfTransfer = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [testSender, BigInt(0), '0x' as `0x${string}`],
  });

  console.log('CallData (self-transfer):', callDataSelfTransfer.slice(0, 66) + '...');
  console.log();

  // Reasonable gas values for a simple ping operation
  // These are much lower than the defaults but enough for basic operations
  const DEFAULT_VERIFICATION_GAS_LIMIT = BigInt(100000);
  const DEFAULT_PRE_VERIFICATION_GAS = BigInt(21000);
  const DEFAULT_CALL_GAS_LIMIT = BigInt(100000);

  // Use reasonable gas prices for Base mainnet (typically < 0.01 gwei base + priority)
  const maxFeePerGas = BigInt(Math.floor(0.1 * 1e9)); // 0.1 gwei - Base has very low fees
  const maxPriorityFeePerGas = BigInt(Math.floor(0.01 * 1e9)); // 0.01 gwei

  // Test 1: Try with zero gas limits (should fail - this is what we're fixing)
  console.log('Test 1: Requesting paymaster data with ZERO gas limits (expected to fail)...');
  try {
    const paymasterClient = createPaymasterClient({
      transport: http(bundlerRpcUrl),
    });

    const stubWithZeroGas = await getPaymasterStubData(paymasterClient, {
      chainId: base.id,
      entryPointAddress: entryPointAddress,
      sender: testSender,
      nonce: BigInt(0),
      callData: callDataSelfTransfer,
      callGasLimit: DEFAULT_CALL_GAS_LIMIT,
      // NOT passing verificationGasLimit or preVerificationGas - they'll default to 0x0
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log('  Unexpected success! Stub:', JSON.stringify(stubWithZeroGas, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no valid calls') || msg.includes('simulation')) {
      console.log('  Expected failure:', msg.slice(0, 200) + '...');
      console.log('  This confirms the zero gas limit issue.\n');
    } else {
      console.log('  Failed with different error:', msg.slice(0, 300));
    }
  }

  // Test 2a: Try with ActivityLogger (might not be on allowlist)
  console.log('Test 2a: Requesting paymaster data for ActivityLogger call...');
  try {
    const paymasterClient = createPaymasterClient({
      transport: http(bundlerRpcUrl),
    });

    const stubWithGas = await getPaymasterStubData(paymasterClient, {
      chainId: base.id,
      entryPointAddress: entryPointAddress,
      sender: testSender,
      nonce: BigInt(0),
      callData: callDataActivityLogger,
      callGasLimit: DEFAULT_CALL_GAS_LIMIT,
      verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
      preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log('  SUCCESS! Paymaster stub data received:');
    console.log('    paymaster:', 'paymaster' in stubWithGas ? stubWithGas.paymaster : 'N/A');
    console.log('    paymasterData:', 'paymasterData' in stubWithGas ? (stubWithGas.paymasterData as string).slice(0, 50) + '...' : 'N/A');
    console.log();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no valid calls')) {
      console.log('  Failed: "no valid calls" - ActivityLogger is NOT on CDP allowlist');
      console.log('  -> Add ActivityLogger to your CDP Paymaster allowlist in CDP Portal');
    } else {
      console.log('  Failed:', msg.slice(0, 300));
    }
    console.log();
  }

  // Test 2b: Try self-transfer (should always work if sender is valid)
  console.log('Test 2b: Requesting paymaster data for self-transfer (no target contract)...');
  try {
    const paymasterClient = createPaymasterClient({
      transport: http(bundlerRpcUrl),
    });

    const stubSelfTransfer = await getPaymasterStubData(paymasterClient, {
      chainId: base.id,
      entryPointAddress: entryPointAddress,
      sender: testSender,
      nonce: BigInt(0),
      callData: callDataSelfTransfer,
      callGasLimit: DEFAULT_CALL_GAS_LIMIT,
      verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
      preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log('  SUCCESS! Paymaster stub data received:');
    console.log('    paymaster:', 'paymaster' in stubSelfTransfer ? stubSelfTransfer.paymaster : 'N/A');
    console.log('    paymasterData:', 'paymasterData' in stubSelfTransfer ? (stubSelfTransfer.paymasterData as string).slice(0, 50) + '...' : 'N/A');
    console.log();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('  Failed:', msg.slice(0, 300));
    console.log();
  }

  // Test 3: Check if the sender is a smart account
  console.log('Test 3: Checking if sender is a deployed smart account...');
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });

    const code = await publicClient.getBytecode({ address: testSender });
    if (code && code !== '0x') {
      console.log('  Sender IS a smart contract (bytecode length:', code.length, 'chars)');
    } else {
      console.log('  Sender is NOT a smart contract (EOA or undeployed)');
      console.log('  For ERC-4337, the sender must be a deployed smart account or include initCode.');
    }
  } catch (err) {
    console.log('  Could not check sender bytecode:', err instanceof Error ? err.message : String(err));
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
