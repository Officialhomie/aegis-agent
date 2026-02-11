/**
 * Verify the smart wallet owner is correctly registered
 */

import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http, keccak256, toBytes, encodeAbiParameters, parseAbiParameters, concat } from 'viem';
import { base } from 'viem/chains';

const SMART_WALLET_ABI = [
  {
    inputs: [{ name: 'index', type: 'uint256' }],
    name: 'ownerAtIndex',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextOwnerIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function main() {
  const smartWalletAddress = '0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f' as `0x${string}`;
  const expectedOwner = '0x7B9763b416F89aB9A2468d8E9f041C4542B5612f' as `0x${string}`;

  console.log('=== Smart Wallet Owner Verification ===\n');
  console.log('Smart Wallet:', smartWalletAddress);
  console.log('Expected Owner:', expectedOwner);
  console.log();

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Check if wallet exists
  const code = await publicClient.getBytecode({ address: smartWalletAddress });
  console.log('Wallet deployed:', !!code && code !== '0x');

  if (!code || code === '0x') {
    console.log('ERROR: Smart wallet not deployed!');
    return;
  }

  // Get next owner index (tells us how many owners exist)
  try {
    const nextIndex = await publicClient.readContract({
      address: smartWalletAddress,
      abi: SMART_WALLET_ABI,
      functionName: 'nextOwnerIndex',
    });
    console.log('Next Owner Index:', nextIndex.toString());
  } catch (e) {
    console.log('Could not read nextOwnerIndex:', e);
  }

  // Get owner at index 0
  try {
    const ownerBytes = await publicClient.readContract({
      address: smartWalletAddress,
      abi: SMART_WALLET_ABI,
      functionName: 'ownerAtIndex',
      args: [BigInt(0)],
    });

    console.log('\nOwner at index 0:');
    console.log('  Raw bytes:', ownerBytes);
    console.log('  Length:', ownerBytes.length, 'bytes');

    if (ownerBytes.length === 66) { // 0x + 64 hex chars = 32 bytes
      // Extract address from lower 20 bytes
      const addressHex = '0x' + ownerBytes.slice(-40);
      console.log('  Extracted address:', addressHex);
      console.log('  Matches expected:', addressHex.toLowerCase() === expectedOwner.toLowerCase());
    }
  } catch (e) {
    console.log('ERROR reading owner at index 0:', e);
  }

  // Also verify the domain separator we're using
  console.log('\n=== EIP-712 Domain Verification ===');

  const domainSeparator = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
      [
        keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toBytes('Coinbase Smart Wallet')),
        keccak256(toBytes('1')),
        BigInt(base.id),
        smartWalletAddress,
      ]
    )
  );
  console.log('Computed Domain Separator:', domainSeparator);

  const MESSAGE_TYPEHASH = keccak256(toBytes('CoinbaseSmartWalletMessage(bytes32 hash)'));
  console.log('MESSAGE_TYPEHASH:', MESSAGE_TYPEHASH);

  // Test with a sample userOpHash
  const sampleUserOpHash = '0xe29ff2d41c52df6a487dd636e4de703bf5a87dd3dbdc59970264bb4e1c6c64e1' as `0x${string}`;
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32'),
      [MESSAGE_TYPEHASH, sampleUserOpHash]
    )
  );
  console.log('\nFor userOpHash:', sampleUserOpHash);
  console.log('Struct Hash:', structHash);

  const finalHash = keccak256(
    concat([
      '0x1901' as `0x${string}`,
      domainSeparator,
      structHash,
    ])
  );
  console.log('Final EIP-712 Hash:', finalHash);
}

main().catch(console.error);
