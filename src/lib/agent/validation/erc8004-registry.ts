/**
 * ERC-8004 Agent Registry Integration
 *
 * Integrates with ERC-8004 Identity Registry on Base mainnet.
 * The registry is an ERC-721 based system where agents register and receive an NFT.
 *
 * Registry Addresses (Base Mainnet):
 * - Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * - Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *
 * How It Works:
 * - Agents register via `register()` and receive an ERC-721 token (agentId)
 * - Token ownership indicates registered agent status
 * - `balanceOf(address)` > 0 means address owns at least one agent registration
 */

import { createPublicClient, http, type Address, getAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { logger } from '../../logger';
import IdentityRegistryABI from './abis/IdentityRegistry.json';

const IDENTITY_REGISTRY_BASE = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const IDENTITY_REGISTRY_BASE_SEPOLIA = '0x8004A818AbfD868722C47D891B32056aDC98E4cc' as const;

/**
 * Check if ERC-8004 registry is available and configured
 */
export function isERC8004Available(): boolean {
  const registryAddress = process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS || IDENTITY_REGISTRY_BASE;
  return !!registryAddress;
}

/**
 * Get registry deployment status and contract information
 */
export function getERC8004RegistryStatus(): {
  deployed: boolean;
  network: string;
  identityRegistry: string;
  reputationRegistry: string;
} {
  const network = process.env.ERC8004_NETWORK || 'base';
  const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS || IDENTITY_REGISTRY_BASE;
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS || '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

  return {
    deployed: true,
    network,
    identityRegistry,
    reputationRegistry,
  };
}

/**
 * Check if address is a registered agent in ERC-8004 Identity Registry
 *
 * Uses balanceOf() from ERC-721 interface:
 * - balanceOf(address) > 0 means address owns at least one agent NFT
 * - Registered agents have balance > 0
 */
export async function isERC8004RegisteredAgent(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<boolean> {
  try {
    // Ensure address is properly checksummed
    const checksummedAddress = getAddress(address);

    const chain = chainName === 'base' ? base : baseSepolia;
    const registryAddress = chainName === 'base'
      ? (process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS as Address || IDENTITY_REGISTRY_BASE)
      : (IDENTITY_REGISTRY_BASE_SEPOLIA);

    const rpcUrl = chainName === 'base'
      ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
      : process.env.RPC_URL_BASE_SEPOLIA;

    if (!rpcUrl) {
      logger.warn('[ERC8004] RPC URL not configured', { chainName });
      return false;
    }

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 5000 }),
    });

    // Query balanceOf(address) - returns number of agent NFTs owned
    const balance = await client.readContract({
      address: getAddress(registryAddress),
      abi: IdentityRegistryABI,
      functionName: 'balanceOf',
      args: [checksummedAddress],
    }) as bigint;

    const isRegistered = balance > BigInt(0);

    logger.debug('[ERC8004] Agent registration check', {
      address: checksummedAddress.slice(0, 10) + '...',
      registryAddress: registryAddress.slice(0, 10) + '...',
      balance: balance.toString(),
      isRegistered,
    });

    return isRegistered;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[ERC8004] Registration check failed', {
      address: address.slice(0, 10) + '...',
      error: message
    });
    return false;
  }
}

/**
 * Get agent ID (tokenId) for a registered agent
 * Note: This requires iterating through owned tokens or using events
 * For now, we only check if registered (balanceOf > 0)
 */
export async function getAgentId(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<bigint | null> {
  try {
    // Ensure address is properly checksummed
    const checksummedAddress = getAddress(address);

    const chain = chainName === 'base' ? base : baseSepolia;
    const registryAddress = chainName === 'base'
      ? (process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS as Address || IDENTITY_REGISTRY_BASE)
      : (IDENTITY_REGISTRY_BASE_SEPOLIA);

    const rpcUrl = chainName === 'base'
      ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
      : process.env.RPC_URL_BASE_SEPOLIA;

    if (!rpcUrl) return null;

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 5000 }),
    });

    // Check balance first
    const balance = await client.readContract({
      address: getAddress(registryAddress),
      abi: IdentityRegistryABI,
      functionName: 'balanceOf',
      args: [checksummedAddress],
    }) as bigint;

    if (balance === BigInt(0)) return null;

    // Note: ERC-721 doesn't have a standard way to get tokenId by owner
    // Would need to use tokenOfOwnerByIndex (ERC-721 Enumerable) or query Transfer events
    // For now, we just confirm registration exists
    return balance; // Return balance as proxy for "has agent ID"
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[ERC8004] Get agent ID failed', { address, error: message });
    return null;
  }
}

/**
 * Log ERC-8004 availability status
 */
export function logERC8004Available(): void {
  const status = getERC8004RegistryStatus();
  logger.info('[ERC8004] Registry available', {
    network: status.network,
    identityRegistry: status.identityRegistry,
    reputationRegistry: status.reputationRegistry,
  });
}

/**
 * Legacy compatibility - log unavailability warning
 * (Now registry is available, but keeping for backward compatibility)
 */
export function logERC8004Unavailable(): void {
  logger.warn('[ERC8004] Registry check disabled or unavailable', {
    fallback: 'Smart account bytecode validation',
  });
}
