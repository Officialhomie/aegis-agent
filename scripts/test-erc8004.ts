/**
 * Test ERC-8004 Registry Integration
 */

import 'dotenv/config';
import {
  isERC8004Available,
  getERC8004RegistryStatus,
  validateAccount,
} from '../src/lib/agent/validation';

async function main() {
  console.log('=== ERC-8004 Registry Integration Test ===\n');

  // Check availability
  const available = isERC8004Available();
  console.log('Registry Available:', available);

  // Get status
  const status = getERC8004RegistryStatus();
  console.log('Network:', status.network);
  console.log('Identity Registry:', status.identityRegistry);
  console.log('Reputation Registry:', status.reputationRegistry);

  // Test with a known smart account from previous validation
  const testAddress = '0x74760fb7e3bD501aBfD3E0A52d312b1055aD25f6' as `0x${string}`;

  console.log('\n=== Testing Smart Account Validation ===');
  console.log('Address:', testAddress);

  const validation = await validateAccount(testAddress, 'base');
  console.log('\nValidation Result:');
  console.log(JSON.stringify(validation, null, 2));

  // Test with a few more addresses
  const testAddresses = [
    '0x498581fF718922c3f8e6A244956aF099B2652b2b', // Uniswap V4 PoolManager (smart contract)
    '0x7C5f5A4bBd8Fd63184577525326123B519429BDc', // Uniswap V4 Position Manager (smart contract)
    '0x01ec9c95be2d95c1b67dc4e13e16f47e4e93c3e9', // Known EOA from previous test
    '0x788639a271e43df7f12c36858a7b4f99caa5c0b4', // Known EOA from previous test
  ] as `0x${string}`[];

  console.log('\n=== Batch Validation Test ===');
  for (const address of testAddresses) {
    const result = await validateAccount(address, 'base');
    console.log(`\n${address}:`);
    console.log(`  Type: ${result.accountType}`);
    console.log(`  Valid: ${result.isValid}`);
    console.log(`  ERC-4337: ${result.isERC4337Compatible}`);
    console.log(`  ERC-8004: ${result.isERC8004Registered}`);
    console.log(`  Reason: ${result.reason}`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
