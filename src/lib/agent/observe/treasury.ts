/**
 * Aegis Agent - Treasury Observation
 *
 * Monitors token balances and treasury state across chains.
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { getDeFiPositions as getDeFiPositionsFromDefi } from './defi';
import { getGovernanceState as getGovernanceStateFromGov } from './governance';
import { getDefaultChainName, getSupportedChainNames } from './chains';
import { getPrice } from './oracles';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import type { Observation } from './index';
import type { DeFiPosition, LendingPosition } from './defi';
import type { GovernanceState } from './governance';

const erc20BalanceOfAbi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface TokenBalance {
  token: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  chainId: number;
}

export interface RiskMetrics {
  totalValueUsd: number;
  concentrationHerfindahl: number;
  liquidationRiskScore: number;
  gasCostRatioBps: number;
  summary: string;
}

export interface TreasuryState {
  tokens: TokenBalance[];
  positions: DeFiPosition[];
  governance: GovernanceState[] | Record<string, never>;
  riskMetrics: RiskMetrics;
}

const chains = {
  base,
  baseSepolia,
  mainnet,
  sepolia,
};

type ChainName = keyof typeof chains;

/** Common ERC-20 token addresses per chain (symbol -> address) */
const TOKENS_BY_CHAIN: Record<ChainName, Record<string, `0x${string}`>> = {
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
    WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  },
  mainnet: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`,
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}`,
  },
  sepolia: {
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as `0x${string}`,
  },
};

function getPublicClient(chainName: ChainName) {
  const chain = chains[chainName];
  const envKey = chainName === 'baseSepolia' ? 'BASE_SEPOLIA_RPC_URL' : `RPC_URL_${chainName.toUpperCase()}`;
  const rpcUrl = process.env[envKey] ?? process.env[`${chainName.toUpperCase()}_RPC_URL`];
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Get ERC-20 balance for one token
 */
async function getTokenBalance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem PublicClient type varies by chain
  client: any,
  treasuryAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  chainId: number
): Promise<TokenBalance | null> {
  try {
    const [balance, decimals, symbol] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: 'balanceOf',
        args: [treasuryAddress],
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: 'symbol',
      }).catch(() => 'UNKNOWN'),
    ]);

    const balanceBigInt = typeof balance === 'bigint' ? balance : BigInt(String(balance));
    const decimalsNum = Number(decimals);
    const balanceFormatted = formatUnits(balanceBigInt, decimalsNum);
    return {
      token: tokenAddress,
      symbol: typeof symbol === 'string' ? symbol : 'UNKNOWN',
      decimals: decimalsNum,
      balance: balanceBigInt.toString(),
      balanceFormatted,
      chainId,
    };
  } catch {
    return null;
  }
}

/**
 * Get token balances for a treasury address on one chain
 */
export async function getTokenBalancesForChain(
  treasuryAddress: string,
  chainName: ChainName
): Promise<TokenBalance[]> {
  const client = getPublicClient(chainName);
  const chainId = chains[chainName].id;
  const tokens = TOKENS_BY_CHAIN[chainName];
  if (!tokens) return [];

  const results = await Promise.all(
    Object.entries(tokens).map(([, address]) =>
      getTokenBalance(client, treasuryAddress as `0x${string}`, address, chainId)
    )
  );
  return results.filter((r): r is TokenBalance => r !== null);
}

/**
 * Get token balances across multiple chains (multi-chain aggregation)
 */
export async function getTokenBalances(
  treasuryAddress: string,
  chainNames: ChainName[] = getSupportedChainNames()
): Promise<TokenBalance[]> {
  const results = await Promise.all(
    chainNames.map((name) => getTokenBalancesForChain(treasuryAddress, name))
  );
  return results.flat();
}

/**
 * DeFi positions (Aave, Compound, Uniswap) - implemented in defi.ts
 */
export async function getDeFiPositions(treasuryAddress: string): Promise<DeFiPosition[]> {
  return getDeFiPositionsFromDefi(treasuryAddress);
}

/**
 * Governance state - implemented in governance.ts
 */
export async function getGovernanceState(treasuryAddress: string): Promise<GovernanceState[] | Record<string, never>> {
  const states = await getGovernanceStateFromGov(treasuryAddress);
  return states.length > 0 ? states : {};
}

/**
 * Compute risk metrics: concentration (Herfindahl), liquidation risk, gas cost ratio.
 */
export async function calculateRiskMetrics(treasuryAddress: string): Promise<RiskMetrics> {
  const [tokens, positions, ethPriceResult] = await Promise.all([
    getTokenBalances(treasuryAddress),
    getDeFiPositionsFromDefi(treasuryAddress),
    getPrice('ETH/USD', getDefaultChainName()).catch(() => null),
  ]);

  const ethUsd = ethPriceResult ? parseFloat(ethPriceResult.price) : 0;
  const valuesUsd: number[] = [];

  for (const t of tokens) {
    const balanceNum = parseFloat(t.balanceFormatted);
    if (Number.isNaN(balanceNum)) continue;
    if (t.symbol === 'WETH' || t.symbol === 'ETH') {
      valuesUsd.push(balanceNum * ethUsd);
    } else if (t.symbol === 'USDC' || t.symbol === 'USDT') {
      valuesUsd.push(balanceNum);
    } else {
      valuesUsd.push(balanceNum * ethUsd * 0.5);
    }
  }

  const lendingPositions = (positions as DeFiPosition[]).filter(
    (p): p is LendingPosition => p.protocol === 'aave' || p.protocol === 'compound'
  );
  let liquidationRiskScore = 0;
  for (const pos of lendingPositions) {
    if (pos.healthFactor) {
      const hf = parseFloat(pos.healthFactor);
      if (!Number.isNaN(hf) && hf > 0) {
        if (hf < 1) liquidationRiskScore = Math.max(liquidationRiskScore, 100);
        else if (hf < 1.5) liquidationRiskScore = Math.max(liquidationRiskScore, 50);
        else if (hf < 2) liquidationRiskScore = Math.max(liquidationRiskScore, 20);
      }
    }
  }

  const totalValueUsd = valuesUsd.reduce((a, b) => a + b, 0);
  let concentrationHerfindahl = 0;
  if (totalValueUsd > 0) {
    for (const v of valuesUsd) {
      const share = v / totalValueUsd;
      concentrationHerfindahl += share * share;
    }
  }

  const gasPriceGwei = 0.05;
  const gasPerTx = 200_000;
  const gasCostEth = (gasPriceGwei * gasPerTx) / 1e9;
  const gasCostUsd = gasCostEth * ethUsd;
  const gasCostRatioBps = totalValueUsd > 0 ? Math.round((gasCostUsd / totalValueUsd) * 10000) : 0;

  const summary = [
    `Total ~$${totalValueUsd.toFixed(0)}`,
    `Concentration HHI ${concentrationHerfindahl.toFixed(2)}`,
    liquidationRiskScore > 0 ? `Liquidation risk ${liquidationRiskScore}` : 'No lending liquidation risk',
    `Gas ratio ${gasCostRatioBps} bps`,
  ].join('; ');

  return {
    totalValueUsd,
    concentrationHerfindahl,
    liquidationRiskScore,
    gasCostRatioBps,
    summary,
  };
}

/**
 * Observe full treasury state for a given address
 */
export async function observeTreasuryState(treasuryAddress: string): Promise<TreasuryState> {
  const [tokens, positions, governance, riskMetrics] = await Promise.all([
    getTokenBalances(treasuryAddress),
    getDeFiPositions(treasuryAddress),
    getGovernanceState(treasuryAddress),
    calculateRiskMetrics(treasuryAddress),
  ]);
  return { tokens, positions, governance, riskMetrics };
}

/**
 * Produce observations for the agent from treasury state
 */
export async function observeTreasury(treasuryAddress: string): Promise<Observation[]> {
  const observations: Observation[] = [];
  const supported = getSupportedChainNames();
  const chainNames: ChainName[] = supported.length > 0 ? supported : ['baseSepolia'];

  for (const chainName of chainNames) {
    const chainId = chains[chainName].id;
    const tokens = TOKENS_BY_CHAIN[chainName];
    if (!tokens) continue;

    try {
      const balances = await getTokenBalancesForChain(treasuryAddress, chainName);
      if (balances.length > 0) {
        observations.push({
          id: `treasury-${chainName}-${treasuryAddress.slice(0, 10)}`,
          timestamp: new Date(),
          source: 'blockchain',
          chainId,
          data: { treasuryAddress, chainName, tokens: balances },
          context: `Treasury token balances on ${chainName}`,
        });
      }
    } catch (error) {
      console.error(`[Treasury] Error observing ${chainName}:`, error);
    }
  }

  return observations;
}
