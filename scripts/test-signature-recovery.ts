/**
 * Test signature recovery to verify the signature is correct
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  keccak256,
  toBytes,
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  recoverAddress,
  hashTypedData,
} from 'viem';
import { base } from 'viem/chains';
import { getKeystoreAccount } from '../src/lib/keystore';

async function main() {
  console.log('=== Signature Recovery Test ===\n');

  const smartWalletAddress = '0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f' as `0x${string}`;
  const sampleUserOpHash = '0xe29ff2d41c52df6a487dd636e4de703bf5a87dd3dbdc59970264bb4e1c6c64e1' as `0x${string}`;

  // Load keystore account
  console.log('Loading keystore account...');
  const ownerAccount = await getKeystoreAccount();
  console.log('Owner address:', ownerAccount.address);
  console.log();

  // Define the EIP-712 domain and types (same as in test-sponsored-tx.ts)
  const domain = {
    name: 'Coinbase Smart Wallet',
    version: '1',
    chainId: base.id,
    verifyingContract: smartWalletAddress,
  };

  const types = {
    CoinbaseSmartWalletMessage: [
      { name: 'hash', type: 'bytes32' },
    ],
  };

  const message = {
    hash: sampleUserOpHash,
  };

  // Sign using signTypedData
  console.log('Signing with signTypedData...');
  const signature = await ownerAccount.signTypedData({
    domain,
    types,
    primaryType: 'CoinbaseSmartWalletMessage',
    message,
  });
  console.log('Signature:', signature);
  console.log('Signature length:', (signature.length - 2) / 2, 'bytes');

  // Compute the hash that was signed (using viem's hashTypedData)
  const typedDataHash = hashTypedData({
    domain,
    types,
    primaryType: 'CoinbaseSmartWalletMessage',
    message,
  });
  console.log('\nTyped data hash (viem):', typedDataHash);

  // Also compute it manually to verify
  const MESSAGE_TYPEHASH = keccak256(toBytes('CoinbaseSmartWalletMessage(bytes32 hash)'));
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
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32'),
      [MESSAGE_TYPEHASH, sampleUserOpHash]
    )
  );
  const manualHash = keccak256(
    concat([
      '0x1901' as `0x${string}`,
      domainSeparator,
      structHash,
    ])
  );
  console.log('Manual hash:', manualHash);
  console.log('Hashes match:', typedDataHash === manualHash);

  // Recover the signer from the signature
  console.log('\nRecovering signer from signature...');
  try {
    const recoveredAddress = await recoverAddress({
      hash: typedDataHash,
      signature,
    });
    console.log('Recovered address:', recoveredAddress);
    console.log('Matches owner:', recoveredAddress.toLowerCase() === ownerAccount.address.toLowerCase());
  } catch (e) {
    console.log('Recovery failed:', e);
  }

  // Also try signing the raw hash directly (without EIP-712)
  console.log('\n=== Alternative: Sign raw hash ===');
  const rawSignature = await ownerAccount.signMessage({ message: { raw: typedDataHash } });
  console.log('Raw signature:', rawSignature);

  try {
    // For personal_sign, the hash is prefixed with "\x19Ethereum Signed Message:\n32"
    // But for raw signing, it should just be the hash
    const recoveredFromRaw = await recoverAddress({
      hash: typedDataHash,
      signature: rawSignature,
    });
    console.log('Recovered from raw:', recoveredFromRaw);
    console.log('Matches owner:', recoveredFromRaw.toLowerCase() === ownerAccount.address.toLowerCase());
  } catch (e) {
    console.log('Recovery from raw failed:', e);
  }

  // Parse signature components
  console.log('\n=== Signature Components ===');
  const r = signature.slice(0, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  console.log('r:', r);
  console.log('s:', s);
  console.log('v:', v, '(should be 27 or 28)');
}

main().catch(console.error);
