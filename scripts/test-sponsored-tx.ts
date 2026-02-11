/**
 * Test REAL sponsored transaction with the new smart wallet.
 * Uses the agent's keystore to sign the UserOperation.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, encodeFunctionData, encodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';
import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint06Address,
  getUserOperationHash,
} from 'viem/account-abstraction';
import { getKeystoreAccount } from '../src/lib/keystore';

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
  console.log('=== Real Sponsored Transaction Test ===\n');

  const bundlerRpcUrl = process.env.COINBASE_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    console.error('ERROR: COINBASE_BUNDLER_RPC_URL not set');
    process.exit(1);
  }

  const activityLoggerAddress = process.env.ACTIVITY_LOGGER_ADDRESS as `0x${string}`;

  // Use the NEW smart wallet we just created
  const smartWalletAddress = '0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f' as `0x${string}`;
  const entryPoint = entryPoint06Address;

  console.log('Configuration:');
  console.log('  Smart Wallet:', smartWalletAddress);
  console.log('  Activity Logger:', activityLoggerAddress);
  console.log('  Entry Point:', entryPoint);
  console.log();

  // Step 1: Load the agent's keystore (owner of the smart wallet)
  console.log('Step 1: Loading agent keystore (smart wallet owner)...');
  const ownerAccount = await getKeystoreAccount();
  console.log('  Owner:', ownerAccount.address);

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

  // Step 2: Get nonce
  console.log('\nStep 2: Getting nonce...');
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
      args: [smartWalletAddress, BigInt(0)],
    }) as bigint;
  } catch (e) {
    console.log('  Using nonce 0 (first transaction)');
  }
  console.log('  Nonce:', nonce.toString());

  // Step 3: Build calldata
  console.log('\nStep 3: Building calldata...');
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

  // Step 4: Get gas prices
  console.log('\nStep 4: Getting gas prices...');
  const block = await publicClient.getBlock();
  const baseFee = block.baseFeePerGas ?? BigInt(1000000);
  const maxFeePerGas = baseFee * BigInt(3); // 3x for safety
  const maxPriorityFeePerGas = BigInt(1000000); // 0.001 gwei

  console.log('  Base Fee:', (Number(baseFee) / 1e9).toFixed(6), 'gwei');
  console.log('  Max Fee:', (Number(maxFeePerGas) / 1e9).toFixed(6), 'gwei');

  const callGasLimit = BigInt(100000);
  const verificationGasLimit = BigInt(150000);
  const preVerificationGas = BigInt(50000);

  // Step 5: Get paymaster data (use getPaymasterData for actual submission, not stub)
  console.log('\nStep 5: Getting paymaster sponsorship...');

  // First, create a dummy signature for the paymaster request
  // The paymaster needs to see the UserOp structure to approve it
  const dummySignature = encodeAbiParameters(
    parseAbiParameters('uint256, bytes'),
    [BigInt(0), '0x' + '00'.repeat(65) as `0x${string}`]
  ) as `0x${string}`;

  const userOpForPaymaster = {
    sender: smartWalletAddress,
    nonce,
    initCode: '0x' as `0x${string}`,
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: dummySignature, // Use dummy signature for paymaster request
  };

  let paymasterAndData: `0x${string}` = '0x';
  try {
    // Use getPaymasterData instead of getPaymasterStubData for actual submission
    const paymasterResult = await paymasterClient.getPaymasterData({
      chainId: base.id,
      entryPointAddress: entryPoint,
      ...userOpForPaymaster,
    });

    console.log('  Paymaster approved!');
    console.log('  Sponsor:', (paymasterResult as any).sponsor?.name || 'Unknown');

    if ('paymasterAndData' in paymasterResult) {
      paymasterAndData = paymasterResult.paymasterAndData as `0x${string}`;
      console.log('  paymasterAndData:', paymasterAndData.slice(0, 50) + '...');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg.slice(0, 300));

    // Fallback to stub data if getPaymasterData fails
    console.log('  Trying getPaymasterStubData as fallback...');
    try {
      const stubResult = await paymasterClient.getPaymasterStubData({
        chainId: base.id,
        entryPointAddress: entryPoint,
        ...userOpForPaymaster,
      });

      console.log('  Stub data received');
      console.log('  Sponsor:', (stubResult as any).sponsor?.name || 'Unknown');

      if ('paymasterAndData' in stubResult) {
        paymasterAndData = stubResult.paymasterAndData as `0x${string}`;
        console.log('  paymasterAndData:', paymasterAndData.slice(0, 50) + '...');
      }
    } catch (stubErr) {
      const stubMsg = stubErr instanceof Error ? stubErr.message : String(stubErr);
      console.error('  Fallback also failed:', stubMsg.slice(0, 300));
      process.exit(1);
    }
  }

  // Step 6: Build final UserOp and sign it
  console.log('\nStep 6: Signing UserOperation...');

  const userOp = {
    sender: smartWalletAddress,
    nonce,
    initCode: '0x' as `0x${string}`, // No initCode needed - wallet exists
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData,
    signature: '0x' as `0x${string}`,
  };

  // Calculate UserOp hash for signing
  const userOpHash = getUserOperationHash({
    userOperation: userOp,
    entryPointAddress: entryPoint,
    entryPointVersion: '0.6',
    chainId: base.id,
  });
  console.log('  UserOp Hash:', userOpHash);

  // Coinbase Smart Wallet uses EIP-712 typed data signing
  // Use viem's signTypedData for correct encoding
  console.log('  Signing with EIP-712 typed data...');

  const rawSignature = await ownerAccount.signTypedData({
    domain: {
      name: 'Coinbase Smart Wallet',
      version: '1',
      chainId: base.id,
      verifyingContract: smartWalletAddress,
    },
    types: {
      CoinbaseSmartWalletMessage: [
        { name: 'hash', type: 'bytes32' },
      ],
    },
    primaryType: 'CoinbaseSmartWalletMessage',
    message: {
      hash: userOpHash,
    },
  });
  console.log('  Raw Signature:', rawSignature.slice(0, 50) + '...');

  // ABI-encode the SignatureWrapper struct for Coinbase Smart Wallet
  // struct SignatureWrapper { uint256 ownerIndex; bytes signatureData; }
  const signature = encodeAbiParameters(
    parseAbiParameters('uint256, bytes'),
    [BigInt(0), rawSignature]
  ) as `0x${string}`;

  console.log('  Signature:', signature.slice(0, 50) + '...');

  // Step 7: Submit UserOperation
  console.log('\nStep 7: Submitting UserOperation...');

  const toHex = (n: bigint) => '0x' + n.toString(16);
  const userOpFormatted = {
    sender: smartWalletAddress,
    nonce: toHex(nonce),
    initCode: '0x',
    callData,
    callGasLimit: toHex(callGasLimit),
    verificationGasLimit: toHex(verificationGasLimit),
    preVerificationGas: toHex(preVerificationGas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    paymasterAndData,
    signature,
  };

  try {
    const opHash = await bundlerClient.request({
      method: 'eth_sendUserOperation' as any,
      params: [userOpFormatted, entryPoint] as any,
    }) as `0x${string}`;

    console.log('  UserOp submitted!');
    console.log('  UserOp Hash:', opHash);

    // Step 8: Wait for receipt
    console.log('\nStep 8: Waiting for transaction...');
    const startTime = Date.now();
    const timeout = 120000;

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await bundlerClient.request({
          method: 'eth_getUserOperationReceipt' as any,
          params: [opHash] as any,
        }) as any;

        if (receipt) {
          console.log('\n========================================');
          console.log('           SUCCESS!');
          console.log('========================================');
          console.log('  Transaction Hash:', receipt.receipt.transactionHash);
          console.log('  Block:', parseInt(receipt.receipt.blockNumber, 16));
          console.log('  Gas Used:', parseInt(receipt.actualGasUsed, 16));
          console.log('  Success:', receipt.success);
          console.log('\n  View on Basescan:');
          console.log(`  https://basescan.org/tx/${receipt.receipt.transactionHash}`);
          return;
        }
      } catch {
        // Not ready yet
      }
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n  Timeout. Check manually:');
    console.log(`  https://jiffyscan.xyz/userOpHash/${opHash}?network=base`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg);

    if (msg.includes('AA')) {
      console.log('\n  ERC-4337 Error detected. Common causes:');
      console.log('  - AA21: Didn\'t pay prefund');
      console.log('  - AA23: Reverted in validation');
      console.log('  - AA24: Signature error');
      console.log('  - AA25: Invalid signature format');
    }
  }
}

main().catch(console.error);
