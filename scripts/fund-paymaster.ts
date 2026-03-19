/**
 * Fund the AegisPaymaster's EntryPoint deposit.
 *
 * AegisPaymaster inherits BasePaymaster.deposit() which calls entryPoint.depositTo().
 * This script calls paymaster.deposit{ value } to pre-fund gas sponsorship capacity.
 *
 * Required env vars:
 *   AEGIS_PAYMASTER_ADDRESS  — deployed paymaster contract address
 *   RPC_URL_BASE_SEPOLIA or RPC_URL_BASE
 *   AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY or EXECUTE_WALLET_PRIVATE_KEY
 *
 * Optional:
 *   PAYMASTER_FUND_ETH  — amount in ETH to deposit (default: 0.05)
 *
 * Usage:
 *   npm run fund:paymaster
 *   PAYMASTER_FUND_ETH=0.1 npm run fund:paymaster
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const PAYMASTER_ABI = [
  {
    inputs: [],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getDeposit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function main() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isBase = networkId === 'base';
  const chain = isBase ? base : baseSepolia;
  const rpcUrl = isBase
    ? process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL
    : process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_RPC_URL;
  const privateKey =
    process.env.AGENT_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    process.env.EXECUTE_WALLET_PRIVATE_KEY;
  const paymasterAddress = process.env.AEGIS_PAYMASTER_ADDRESS as Address | undefined;
  const fundEth = process.env.PAYMASTER_FUND_ETH ?? '0.05';

  if (!rpcUrl || !paymasterAddress || !privateKey) {
    console.error('Missing required env. Set:');
    if (!rpcUrl) console.error('  - RPC_URL_BASE_SEPOLIA (or RPC_URL_BASE for mainnet)');
    if (!paymasterAddress) console.error('  - AEGIS_PAYMASTER_ADDRESS');
    if (!privateKey) console.error('  - AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const valueWei = parseEther(fundEth);

  // Check current deposit
  const currentDeposit = await publicClient.readContract({
    address: paymasterAddress,
    abi: PAYMASTER_ABI,
    functionName: 'getDeposit',
  });

  console.log('[Fund] Current EntryPoint deposit:', formatEth(currentDeposit), 'ETH');
  console.log('[Fund] Depositing:', fundEth, 'ETH from', account.address);

  const hash = await walletClient.writeContract({
    address: paymasterAddress,
    abi: PAYMASTER_ABI,
    functionName: 'deposit',
    value: valueWei,
  });

  console.log('[Fund] Transaction sent:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('[Fund] Transaction confirmed (block', receipt.blockNumber, ')');

  const newDeposit = await publicClient.readContract({
    address: paymasterAddress,
    abi: PAYMASTER_ABI,
    functionName: 'getDeposit',
  });

  console.log('[Fund] New EntryPoint deposit:', formatEth(newDeposit), 'ETH');
  console.log('[Fund] AegisPaymaster funded successfully.');
}

function formatEth(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(6);
}

main().catch((err) => {
  console.error('[Fund] Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
