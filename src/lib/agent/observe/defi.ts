/**
 * Aegis Agent - DeFi Position Observation
 *
 * Monitors Aave V3, Compound V3, and Uniswap V3 positions via viem contract reads.
 * Requires protocol contract addresses via env (e.g. AAVE_POOL_DATA_PROVIDER_84532).
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import type { Observation } from './index';

const CHAIN_ID_TO_CHAIN = {
  [baseSepolia.id]: baseSepolia,
  [base.id]: base,
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
} as const;

export interface LendingPosition {
  protocol: 'aave' | 'compound';
  chainId: number;
  supplied: { token: string; amount: string; valueUsd?: string }[];
  borrowed: { token: string; amount: string; valueUsd?: string }[];
  healthFactor?: string;
  collateralRatio?: string;
}

export interface LiquidityPosition {
  protocol: 'uniswap' | 'uniswap-v3' | 'other';
  chainId: number;
  poolId: string;
  token0: string;
  token1: string;
  liquidity: string;
  shareOfPool?: string;
  valueUsd?: string;
}

export type DeFiPosition = LendingPosition | LiquidityPosition;

function getSupportedChainIds(): number[] {
  const raw = process.env.SUPPORTED_CHAINS;
  if (!raw?.trim()) return [84532];
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function getPublicClientForChainId(chainId: number) {
  const chain = CHAIN_ID_TO_CHAIN[chainId as keyof typeof CHAIN_ID_TO_CHAIN];
  if (!chain) return null;
  const rpcKey =
    chainId === 84532 ? 'RPC_URL_BASE_SEPOLIA' : `RPC_URL_${chain.name.toUpperCase().replace(/-/g, '_')}`;
  const rpcUrl = process.env[rpcKey] ?? process.env[`RPC_URL_${chainId}`];
  if (!rpcUrl) return null;
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

// Aave V3 Pool Data Provider: getUserAccountData(user)
const AAVE_USER_ACCOUNT_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get Aave V3 lending positions. Requires AAVE_POOL_DATA_PROVIDER_<CHAIN_ID>.
 */
export async function getAavePositions(
  address: string,
  chainId: number
): Promise<LendingPosition[]> {
  const dataProvider = process.env[`AAVE_POOL_DATA_PROVIDER_${chainId}`] as `0x${string}` | undefined;
  if (!dataProvider) return [];

  const client = getPublicClientForChainId(chainId);
  if (!client) return [];

  const user = address as `0x${string}`;
  try {
    const [totalCollateralBase, totalDebtBase, , , , healthFactor] = await client.readContract({
      address: dataProvider,
      abi: AAVE_USER_ACCOUNT_ABI,
      functionName: 'getUserAccountData',
      args: [user],
    });
    if (totalCollateralBase === BigInt(0) && totalDebtBase === BigInt(0)) return [];

    const supplied =
      totalCollateralBase > BigInt(0)
        ? [{ token: 'COLLATERAL', amount: totalCollateralBase.toString(), valueUsd: undefined }]
        : [];
    const borrowed =
      totalDebtBase > BigInt(0)
        ? [{ token: 'DEBT', amount: totalDebtBase.toString(), valueUsd: undefined }]
        : [];
    const healthFactorStr = healthFactor > BigInt(0) ? healthFactor.toString() : undefined;
    const collateralRatio =
      totalDebtBase > BigInt(0) && totalCollateralBase > BigInt(0)
        ? (Number((totalCollateralBase * BigInt(10000)) / totalDebtBase) / 100).toString()
        : undefined;

    return [
      {
        protocol: 'aave',
        chainId,
        supplied,
        borrowed,
        healthFactor: healthFactorStr,
        collateralRatio,
      },
    ];
  } catch {
    return [];
  }
}

// Compound V3 Comet: balanceOf(user), borrowBalanceOf(user)
const COMPOUND_COMET_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'borrowBalanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get Compound V3 (Comet) positions. Requires COMPOUND_COMET_<CHAIN_ID>.
 */
export async function getCompoundPositions(
  address: string,
  chainId: number
): Promise<LendingPosition[]> {
  const cometAddress = process.env[`COMPOUND_COMET_${chainId}`] as `0x${string}` | undefined;
  if (!cometAddress) return [];

  const client = getPublicClientForChainId(chainId);
  if (!client) return [];

  const user = address as `0x${string}`;
  try {
    const [supplyBalance, borrowBalance] = await Promise.all([
      client.readContract({
        address: cometAddress,
        abi: COMPOUND_COMET_ABI,
        functionName: 'balanceOf',
        args: [user],
      }),
      client.readContract({
        address: cometAddress,
        abi: COMPOUND_COMET_ABI,
        functionName: 'borrowBalanceOf',
        args: [user],
      }),
    ]);
    if (supplyBalance === BigInt(0) && borrowBalance === BigInt(0)) return [];

    const supplied =
      supplyBalance > BigInt(0)
        ? [{ token: cometAddress, amount: supplyBalance.toString(), valueUsd: undefined }]
        : [];
    const borrowed =
      borrowBalance > BigInt(0)
        ? [{ token: cometAddress, amount: borrowBalance.toString(), valueUsd: undefined }]
        : [];

    return [
      {
        protocol: 'compound',
        chainId,
        supplied,
        borrowed,
      },
    ];
  } catch {
    return [];
  }
}

// Uniswap V3 NonfungiblePositionManager: balanceOf(owner), tokenOfOwnerByIndex(owner, index), positions(tokenId)
const UNISWAP_NFT_MANAGER_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get Uniswap V3 LP positions. Requires UNISWAP_POSITION_MANAGER_<CHAIN_ID>.
 */
export async function getUniswapPositions(
  address: string,
  chainId: number
): Promise<LiquidityPosition[]> {
  const managerAddress = process.env[`UNISWAP_POSITION_MANAGER_${chainId}`] as `0x${string}` | undefined;
  if (!managerAddress) return [];

  const client = getPublicClientForChainId(chainId);
  if (!client) return [];

  const owner = address as `0x${string}`;
  try {
    const balance = await client.readContract({
      address: managerAddress,
      abi: UNISWAP_NFT_MANAGER_ABI,
      functionName: 'balanceOf',
      args: [owner],
    });
    const count = Number(balance);
    if (count === 0) return [];

    const positions: LiquidityPosition[] = [];
    for (let i = 0; i < Math.min(count, 20); i++) {
      try {
        const tokenId = await client.readContract({
          address: managerAddress,
          abi: UNISWAP_NFT_MANAGER_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [owner, BigInt(i)],
        });
        const [, , token0, token1, fee, , , liquidity] = await client.readContract({
          address: managerAddress,
          abi: UNISWAP_NFT_MANAGER_ABI,
          functionName: 'positions',
          args: [tokenId],
        });
        positions.push({
          protocol: 'uniswap-v3',
          chainId,
          poolId: tokenId.toString(),
          token0,
          token1,
          liquidity: liquidity.toString(),
        });
      } catch {
        // skip failed position
      }
    }
    return positions;
  } catch {
    return [];
  }
}

/**
 * Aggregate all DeFi positions for a treasury address across configured chains.
 */
export async function getDeFiPositions(
  treasuryAddress: string,
  chainIds: number[] = getSupportedChainIds()
): Promise<DeFiPosition[]> {
  const positions: DeFiPosition[] = [];
  for (const chainId of chainIds) {
    const [aave, compound, uniswap] = await Promise.all([
      getAavePositions(treasuryAddress, chainId),
      getCompoundPositions(treasuryAddress, chainId),
      getUniswapPositions(treasuryAddress, chainId),
    ]);
    positions.push(...aave, ...compound, ...uniswap);
  }
  return positions;
}

/**
 * Produce observations for the agent from DeFi positions.
 */
export async function observeDeFiPositions(
  treasuryAddress: string,
  chainIds: number[] = getSupportedChainIds()
): Promise<Observation[]> {
  const positions = await getDeFiPositions(treasuryAddress, chainIds);
  if (positions.length === 0) return [];

  return [
    {
      id: `defi-${treasuryAddress.slice(0, 10)}`,
      timestamp: new Date(),
      source: 'blockchain',
      data: { treasuryAddress, positions },
      context: `DeFi positions (${positions.length} total)`,
    },
  ];
}
