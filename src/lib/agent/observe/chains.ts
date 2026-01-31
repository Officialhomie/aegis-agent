/**
 * Aegis Agent - Configurable Chain Support
 *
 * SUPPORTED_CHAINS env var: comma-separated chain IDs (e.g. "84532,8453").
 * Default: baseSepolia (84532).
 */

import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

export const CHAIN_ID_TO_CHAIN = {
  [baseSepolia.id]: baseSepolia,
  [base.id]: base,
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
} as const;

export const chains = {
  base,
  baseSepolia,
  mainnet,
  sepolia,
} as const;

export type ChainName = keyof typeof chains;

const CHAIN_ID_TO_NAME: Record<number, ChainName> = {
  [baseSepolia.id]: 'baseSepolia',
  [base.id]: 'base',
  [mainnet.id]: 'mainnet',
  [sepolia.id]: 'sepolia',
};

const DEFAULT_CHAIN_ID = 84532; // baseSepolia

/**
 * Parse SUPPORTED_CHAINS env (e.g. "84532,8453") into list of chain IDs.
 * Defaults to [84532] when unset or empty.
 */
export function getSupportedChainIds(): number[] {
  const raw = process.env.SUPPORTED_CHAINS;
  if (!raw?.trim()) return [DEFAULT_CHAIN_ID];
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

/**
 * Default chain name for observations (first supported chain, or baseSepolia).
 */
export function getDefaultChainName(): ChainName {
  const ids = getSupportedChainIds();
  const first = ids[0];
  if (first != null && CHAIN_ID_TO_NAME[first]) return CHAIN_ID_TO_NAME[first];
  return 'baseSepolia';
}

/**
 * Supported chain IDs mapped to ChainName[] (only known chains).
 */
export function getSupportedChainNames(): ChainName[] {
  const ids = getSupportedChainIds();
  return ids
    .map((id) => CHAIN_ID_TO_NAME[id])
    .filter((name): name is ChainName => name != null);
}
