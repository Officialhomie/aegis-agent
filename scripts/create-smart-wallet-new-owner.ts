/**
 * Create a new Coinbase Smart Wallet with a NEW EOA as owner.
 * The new owner's PRIVATE KEY is printed so you can use it to sign UserOps.
 * Gas for deployment is paid by the agent keystore.
 *
 * Usage:
 *   npx tsx scripts/create-smart-wallet-new-owner.ts
 *
 * Prerequisites:
 *   - .env with BASE_RPC_URL, KEYSTORE_ACCOUNT, KEYSTORE_PASSWORD
 *   - Agent keystore EOA must have some ETH on Base to pay for createAccount tx
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { getKeystoreAccount } from '../src/lib/keystore';

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

function encodeOwnerAddress(address: string): `0x${string}` {
  return ('0x000000000000000000000000' + address.slice(2).toLowerCase()) as `0x${string}`;
}

async function main() {
  console.log('=== Create Coinbase Smart Wallet (new owner EOA) ===\n');

  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE;
  if (!rpcUrl) {
    console.error('ERROR: BASE_RPC_URL or RPC_URL_BASE not set in .env');
    process.exit(1);
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // 1. Generate new EOA (owner) and print private key
  const ownerPrivateKey = generatePrivateKey();
  const ownerAccount = privateKeyToAccount(ownerPrivateKey);

  console.log('Step 1: New owner EOA (SAVE THIS PRIVATE KEY SECURELY)');
  console.log('  Owner address:  ', ownerAccount.address);
  console.log('  Owner private key:', ownerPrivateKey);
  console.log('  WARNING: Store the private key securely. Anyone with it can control the smart wallet.\n');

  // 2. Load keystore to pay for deployment
  console.log('Step 2: Loading agent keystore (pays for deployment)...');
  const payerAccount = await getKeystoreAccount();
  const walletClient = createWalletClient({
    account: payerAccount,
    chain: base,
    transport: http(rpcUrl),
  });
  console.log('  Payer EOA:', payerAccount.address);

  const owners = [encodeOwnerAddress(ownerAccount.address)];
  const nonce = BigInt(Date.now());

  // 3. Predict smart wallet address
  console.log('\nStep 3: Predicting smart wallet address...');
  const predictedAddress = await publicClient.readContract({
    address: SMART_WALLET_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getAddress',
    args: [owners, nonce],
  });
  console.log('  Smart Wallet address:', predictedAddress);

  const existingCode = await publicClient.getBytecode({ address: predictedAddress });
  if (existingCode && existingCode !== '0x') {
    console.log('  Smart wallet already exists at this nonce.');
    console.log('\n=== USE THIS OWNER KEY FOR SIGNING ===');
    console.log('  Smart Wallet:', predictedAddress);
    console.log('  Owner private key:', ownerPrivateKey);
    return;
  }

  // 4. Deploy (payer pays gas)
  console.log('\nStep 4: Creating smart wallet (payer pays gas)...');
  try {
    const hash = await walletClient.writeContract({
      address: SMART_WALLET_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'createAccount',
      args: [owners, nonce],
      value: BigInt(0),
    });
    console.log('  Tx hash:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('  Confirmed in block:', receipt.blockNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ERROR:', msg);
    if (msg.includes('insufficient funds')) {
      const bal = await publicClient.getBalance({ address: payerAccount.address });
      console.log('  Payer balance:', Number(bal) / 1e18, 'ETH');
    }
    process.exit(1);
  }

  const newCode = await publicClient.getBytecode({ address: predictedAddress });
  if (!newCode || newCode === '0x') {
    console.error('  ERROR: Smart wallet not created');
    process.exit(1);
  }

  console.log('\n=== COINBASE SMART WALLET CREATED ===');
  console.log('  Smart Wallet address:', predictedAddress);
  console.log('  Owner address:      ', ownerAccount.address);
  console.log('  Owner private key:  ', ownerPrivateKey);
  console.log('\n  Add to .env (for sponsorship candidate / tests):');
  console.log('  SMART_WALLET_ADDRESS="' + predictedAddress + '"');
  console.log('  SMART_WALLET_OWNER_PRIVATE_KEY="' + ownerPrivateKey + '"');
  console.log('\n  Optional: add to WHITELISTED_LOW_GAS_CANDIDATES for sponsorship:');
  console.log('  WHITELISTED_LOW_GAS_CANDIDATES="' + predictedAddress + '"');
  console.log('\n  Basescan: https://basescan.org/address/' + predictedAddress);
}

main().catch(console.error);
