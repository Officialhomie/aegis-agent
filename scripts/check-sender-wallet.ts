import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

async function main() {
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const sender = '0xbdA97b283f9C93C1EA025b6240f299D81E6c0823' as `0x${string}`;

  console.log('Checking sender:', sender);

  const code = await client.getBytecode({ address: sender });
  console.log('Bytecode:', code);
  console.log('Bytecode length:', code?.length || 0);

  // Check if EIP-1167 minimal proxy (starts with 0x363d3d373d3d3d363d73)
  if (code?.startsWith('0x363d3d373d3d3d363d73')) {
    const impl = '0x' + code.slice(22, 62);
    console.log('EIP-1167 proxy implementation:', impl);

    // Known implementations
    if (impl.toLowerCase() === '0x000000000000dbe3a8a0df2e0b77f59d8d2c0123') {
      console.log('-> This is a Coinbase Smart Wallet!');
    }
  } else if (code?.startsWith('0xef01')) {
    console.log('This is an EIP-7702 delegated account');
  } else {
    console.log('Not a standard proxy pattern');
  }

  // Try to call entryPoint() to verify it's an ERC-4337 account
  try {
    const entryPoint = await client.readContract({
      address: sender,
      abi: [{
        name: 'entryPoint',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      }],
      functionName: 'entryPoint',
    });
    console.log('EntryPoint:', entryPoint);
  } catch (e) {
    console.log('Cannot read entryPoint() - may not be a standard ERC-4337 account');
  }
}

main().catch(console.error);
