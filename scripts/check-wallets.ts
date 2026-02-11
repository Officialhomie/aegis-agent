import dotenv from 'dotenv';
dotenv.config();

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

async function main() {
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Check the agent wallet
  const agentWallet = process.env.AGENT_WALLET_ADDRESS as `0x${string}`;
  console.log('Agent Wallet:', agentWallet);

  const agentCode = await client.getBytecode({ address: agentWallet });
  console.log('  Is Smart Contract:', !!agentCode && agentCode !== '0x');

  // Check the Coinbase Smart Wallet
  const cbWallet = '0xbdA97b283f9C93C1EA025b6240f299D81E6c0823' as `0x${string}`;
  console.log('\nCoinbase Smart Wallet:', cbWallet);

  const cbCode = await client.getBytecode({ address: cbWallet });
  console.log('  Is Smart Contract:', !!cbCode && cbCode !== '0x');

  // Check the whitelisted wallet
  const whitelisted = process.env.WHITELISTED_LOW_GAS_CANDIDATES?.split(',')[0] as `0x${string}`;
  console.log('\nWhitelisted Wallet:', whitelisted);

  const wlCode = await client.getBytecode({ address: whitelisted });
  console.log('  Is Smart Contract:', !!wlCode && wlCode !== '0x');

  console.log('\nNote: To submit a UserOperation, you need the private key of the smart wallet owner.');
  console.log('The agent keystore wallet is likely an EOA, not a smart account.');
}

main().catch(console.error);
