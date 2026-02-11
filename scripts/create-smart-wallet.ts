/**
 * Create a new Coinbase Smart Wallet using CDP SDK
 * The agent's keystore EOA will be the owner.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { getKeystoreAccount } from '../src/lib/keystore';

// Coinbase Smart Wallet Factory on Base
const SMART_WALLET_FACTORY = '0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a' as `0x${string}`;

const FACTORY_ABI = [
  {
    inputs: [
      { name: 'owners', type: 'bytes[]' },
      { name: 'nonce', type: 'uint256' },
    ],
    name: 'createAccount',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owners', type: 'bytes[]' },
      { name: 'nonce', type: 'uint256' },
    ],
    name: 'getAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function main() {
  console.log('=== Create Coinbase Smart Wallet ===\n');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Get the agent's keystore account (this will be the owner)
  console.log('Step 1: Loading agent keystore...');
  const account = await getKeystoreAccount();
  console.log('  Agent EOA:', account.address);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Encode the owner as bytes (for EOA, it's just the padded address)
  // For Coinbase Smart Wallet, owners are encoded as: abi.encode(address)
  const ownerBytes = ('0x000000000000000000000000' + account.address.slice(2).toLowerCase()) as `0x${string}`;
  const owners = [ownerBytes];
  const nonce = BigInt(Date.now()); // Use timestamp as unique nonce

  // First, predict the address
  console.log('\nStep 2: Predicting smart wallet address...');
  const predictedAddress = await publicClient.readContract({
    address: SMART_WALLET_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getAddress',
    args: [owners, nonce],
  });
  console.log('  Predicted Address:', predictedAddress);

  // Check if it already exists
  const existingCode = await publicClient.getBytecode({ address: predictedAddress });
  if (existingCode && existingCode !== '0x') {
    console.log('  Smart wallet already exists!');
    console.log('\n=== SMART WALLET READY ===');
    console.log('  Address:', predictedAddress);
    console.log('  Owner:', account.address);
    return;
  }

  // Create the smart wallet
  console.log('\nStep 3: Creating smart wallet...');
  console.log('  This will send a transaction from your agent EOA.');

  try {
    const hash = await walletClient.writeContract({
      address: SMART_WALLET_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'createAccount',
      args: [owners, nonce],
      value: BigInt(0),
    });

    console.log('  Transaction sent:', hash);
    console.log('  Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('  Confirmed in block:', receipt.blockNumber);

    // Verify the smart wallet was created
    const newCode = await publicClient.getBytecode({ address: predictedAddress });
    if (newCode && newCode !== '0x') {
      console.log('\n=== SMART WALLET CREATED ===');
      console.log('  Address:', predictedAddress);
      console.log('  Owner:', account.address);
      console.log('  Transaction:', hash);
      console.log('\n  View on Basescan:');
      console.log(`  https://basescan.org/address/${predictedAddress}`);
      console.log('\n  Add to .env:');
      console.log(`  SMART_WALLET_ADDRESS="${predictedAddress}"`);
    } else {
      console.error('  ERROR: Smart wallet not created');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg);

    if (msg.includes('insufficient funds')) {
      const balance = await publicClient.getBalance({ address: account.address });
      console.log('\n  Agent ETH balance:', Number(balance) / 1e18, 'ETH');
      console.log('  You need ETH in your agent wallet to create the smart wallet.');
    }
  }
}

main().catch(console.error);
