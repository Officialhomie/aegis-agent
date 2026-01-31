/**
 * Aegis Agent - Blockchain Observation
 * 
 * Uses viem to read on-chain state for the agent to reason about.
 */

import { createPublicClient, http, formatEther } from 'viem';
import type { Abi } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import { getDefaultChainName, getSupportedChainNames } from './chains';
import type { Observation } from './index';

const chains = {
  base,
  baseSepolia,
  mainnet,
  sepolia,
};

type ChainName = keyof typeof chains;

function getPublicClient(chainName: ChainName) {
  const chain = chains[chainName];
  const envKey =
    chainName === 'baseSepolia' ? 'BASE_SEPOLIA_RPC_URL' : `RPC_URL_${chainName.toUpperCase()}`;
  const rpcUrl = process.env[envKey] ?? process.env[`${chainName.toUpperCase()}_RPC_URL`];
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Observe the current blockchain state (configurable via SUPPORTED_CHAINS)
 */
export async function observeBlockchainState(): Promise<Observation[]> {
  const observations: Observation[] = [];
  const chainNames = getSupportedChainNames();
  const defaultChain = chainNames[0] ?? getDefaultChainName();

  for (const chainName of chainNames.length > 0 ? chainNames : [defaultChain]) {
    const name = chainName as ChainName;
    const client = getPublicClient(name);
    try {
      const blockNumber = await client.getBlockNumber();
      const gasPrice = await client.getGasPrice();
      const chain = chains[name];
      observations.push({
        id: `block-${chain.id}-${blockNumber}`,
        timestamp: new Date(),
        source: 'blockchain',
        chainId: chain.id,
        blockNumber,
        data: {
          blockNumber: blockNumber.toString(),
          gasPrice: gasPrice.toString(),
          gasPriceGwei: formatEther(gasPrice * BigInt(1e9)),
        },
        context: `Current block state on ${name}`,
      });
    } catch (error) {
      console.error('[Blockchain] Error observing state:', error);
    }
  }
  return observations;
}

/**
 * Get ETH balance for an address
 */
export async function getBalance(
  address: `0x${string}`,
  chainName: ChainName = getDefaultChainName()
): Promise<bigint> {
  const client = getPublicClient(chainName);
  return client.getBalance({ address });
}

/**
 * Read contract state
 */
export async function readContract(
  address: `0x${string}`,
  abi: Abi,
  functionName: string,
  args: unknown[] = [],
  chainName: ChainName = getDefaultChainName()
): Promise<unknown> {
  const client = getPublicClient(chainName);
  return client.readContract({
    address,
    abi,
    functionName,
    args,
  });
}
