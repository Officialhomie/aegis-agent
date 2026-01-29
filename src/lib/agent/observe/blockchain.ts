/**
 * Aegis Agent - Blockchain Observation
 * 
 * Uses viem to read on-chain state for the agent to reason about.
 */

import { createPublicClient, http, formatEther, type PublicClient } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import type { Observation } from './index';

// Chain configurations
const chains = {
  base,
  baseSepolia,
  mainnet,
  sepolia,
};

type ChainName = keyof typeof chains;

// Create public clients for each chain
function getPublicClient(chainName: ChainName): PublicClient {
  const chain = chains[chainName];
  const rpcUrl = process.env[`RPC_URL_${chainName.toUpperCase()}`];
  
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Observe the current blockchain state
 */
export async function observeBlockchainState(): Promise<Observation[]> {
  const observations: Observation[] = [];
  
  // Default to Base Sepolia for development
  const chainName: ChainName = 'baseSepolia';
  const client = getPublicClient(chainName);

  try {
    // Get current block number
    const blockNumber = await client.getBlockNumber();
    
    // Get gas price
    const gasPrice = await client.getGasPrice();

    observations.push({
      id: `block-${blockNumber}`,
      timestamp: new Date(),
      source: 'blockchain',
      chainId: chains[chainName].id,
      blockNumber,
      data: {
        blockNumber: blockNumber.toString(),
        gasPrice: gasPrice.toString(),
        gasPriceGwei: formatEther(gasPrice * BigInt(1e9)),
      },
      context: `Current block state on ${chainName}`,
    });

    // TODO: Add treasury balance observation
    // TODO: Add governance state observation
    // TODO: Add relevant contract state observation

  } catch (error) {
    console.error('[Blockchain] Error observing state:', error);
  }

  return observations;
}

/**
 * Get ETH balance for an address
 */
export async function getBalance(
  address: `0x${string}`,
  chainName: ChainName = 'baseSepolia'
): Promise<bigint> {
  const client = getPublicClient(chainName);
  return client.getBalance({ address });
}

/**
 * Read contract state
 */
export async function readContract(
  address: `0x${string}`,
  abi: unknown[],
  functionName: string,
  args: unknown[] = [],
  chainName: ChainName = 'baseSepolia'
): Promise<unknown> {
  const client = getPublicClient(chainName);
  return client.readContract({
    address,
    abi,
    functionName,
    args,
  } as any);
}
