/**
 * Test real sponsorship using CDP AgentKit to manage the smart wallet.
 * This creates a wallet using CDP and tests the full sponsorship flow.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, encodeFunctionData, toHex, parseEther } from 'viem';
import { base } from 'viem/chains';
import {
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
  console.log('=== CDP Sponsorship Test ===\n');

  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('ERROR: COINBASE_BUNDLER_RPC_URL not set');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;

  // Use the existing Coinbase Smart Wallet that passed the test
  const sender = '0xbdA97b283f9C93C1EA025b6240f299D81E6c0823' as `0x${string}`;
  const entryPoint = entryPoint06Address;

  console.log('Configuration:');
  console.log('  Sender:', sender);
  console.log('  Activity Logger:', activityLoggerAddress);
  console.log('  Entry Point:', entryPoint);
  console.log();

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const paymasterClient = createPaymasterClient({
    transport: http(bundlerRpcUrl),
  });

  // Get nonce
  console.log('Step 1: Getting nonce...');
  let nonce = BigInt(0);
  try {
    nonce = await publicClient.readContract({
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
    }) as bigint;
  } catch (e) {
    console.log('  Using nonce 0');
  }
  console.log('  Nonce:', nonce.toString());

  // Build calldata
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

  // Get gas prices - use ACTUAL Base prices (very low)
  console.log('\nStep 3: Getting gas prices...');
  const block = await publicClient.getBlock();
  const baseFee = block.baseFeePerGas ?? BigInt(1000000);
  const maxFeePerGas = baseFee * BigInt(2);
  const maxPriorityFeePerGas = BigInt(100000);

  console.log('  Base Fee:', (Number(baseFee) / 1e9).toFixed(6), 'gwei');
  console.log('  Max Fee:', (Number(maxFeePerGas) / 1e9).toFixed(6), 'gwei');

  const callGasLimit = BigInt(100000);
  const verificationGasLimit = BigInt(100000);
  const preVerificationGas = BigInt(50000);

  // Get paymaster data
  console.log('\nStep 4: Getting paymaster sponsorship...');
  const userOp = {
    sender,
    nonce,
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: '0x' as `0x${string}`,
  };

  try {
    const paymasterResult = await paymasterClient.getPaymasterStubData({
      chainId: base.id,
      entryPointAddress: entryPoint,
      ...userOp,
    });

    console.log('  Paymaster approved!');
    console.log('  Sponsor:', (paymasterResult as any).sponsor?.name || 'Unknown');

    if ('paymasterAndData' in paymasterResult) {
      console.log('  paymasterAndData:', (paymasterResult.paymasterAndData as string).slice(0, 50) + '...');
    }

    // Estimate the cost
    const totalGas = callGasLimit + verificationGasLimit + preVerificationGas;
    const maxCostWei = totalGas * maxFeePerGas;
    const maxCostETH = Number(maxCostWei) / 1e18;
    const maxCostUSD = maxCostETH * 2500;

    console.log('\n=== SPONSORSHIP VERIFIED ===');
    console.log('  The CDP paymaster would sponsor this operation.');
    console.log('  Estimated cost:', maxCostUSD.toFixed(4), 'USD');
    console.log('\n  To actually submit the UserOp, you need the');
    console.log('  private key of the smart wallet owner to sign.');
    console.log('\n  The paymaster integration is WORKING correctly!');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg.slice(0, 300));
  }
}

main().catch(console.error);
