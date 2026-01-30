/**
 * Aegis Agent - Oracle / Price Feed Observation
 *
 * Chainlink price feeds with CoinGecko API fallback and TTL cache.
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import type { Observation } from './index';

const chainlinkAggregatorAbi = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
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
] as const;

export interface PriceFeedResult {
  pair: string;
  price: string;
  decimals: number;
  source: 'chainlink' | 'coingecko';
  chainId?: number;
  updatedAt: number;
}

const chains = { base, baseSepolia, mainnet, sepolia };
type ChainName = keyof typeof chains;

/** Chainlink price feed addresses (ETH/USD, etc.) - override via env CHAINLINK_<PAIR>_<CHAIN> */
const CHAINLINK_FEEDS: Record<string, Partial<Record<ChainName, `0x${string}`>>> = {
  'ETH/USD': {
    base: '0x71041dddad3595F9CEd3DcEcBe5D1B5D9786930C' as `0x${string}`,
    baseSepolia: '0x4aDC67696ba383F43DD60A9e78F2C97Fbbfc7cb1' as `0x${string}`,
    mainnet: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' as `0x${string}`,
    sepolia: '0x694AA1769357215DE4FAC081bf1f309aDC325306' as `0x${string}`,
  },
  'BTC/USD': {
    base: '0xACeF4E9f1f0F6Ef21F245F79b4Dd6eF5d0F2b7a0' as `0x${string}`,
    mainnet: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' as `0x${string}`,
  },
};

const CACHE_TTL_MS = Number(process.env.ORACLE_CACHE_TTL_MS) || 60_000; // 1 min
const cache = new Map<string, { value: PriceFeedResult; expires: number }>();

function cacheKey(pair: string, chainName: string, source: string): string {
  return `${source}:${chainName}:${pair}`;
}

function getCached(key: string): PriceFeedResult | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.value;
}

function setCached(key: string, value: PriceFeedResult): void {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

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

function getFeedAddress(pair: string, chainName: ChainName): `0x${string}` | null {
  const envKey = `CHAINLINK_${pair.replace('/', '_')}_${chainName.toUpperCase()}`;
  const envAddr = process.env[envKey];
  if (envAddr && envAddr.startsWith('0x')) return envAddr as `0x${string}`;
  const feeds = CHAINLINK_FEEDS[pair];
  return (feeds?.[chainName] as `0x${string}`) ?? null;
}

/**
 * Fetch price from Chainlink AggregatorV3
 */
export async function getChainlinkPrice(
  pair: string,
  chainName: ChainName = 'baseSepolia'
): Promise<PriceFeedResult | null> {
  const key = cacheKey(pair, chainName, 'chainlink');
  const cached = getCached(key);
  if (cached) return cached;

  const address = getFeedAddress(pair, chainName);
  if (!address) return null;

  try {
    const client = getPublicClient(chainName);
    const [roundData, decimals] = await Promise.all([
      client.readContract({
        address,
        abi: chainlinkAggregatorAbi,
        functionName: 'latestRoundData',
      }),
      client.readContract({
        address,
        abi: chainlinkAggregatorAbi,
        functionName: 'decimals',
      }),
    ]);
    const tuple = roundData as readonly [bigint, bigint, bigint, bigint, bigint];
    const answer = tuple[1];
    const updatedAt = Number(tuple[3]);
    const decimalsNum = Number(decimals);
    const price = Number(answer) / 10 ** decimalsNum;
    const result: PriceFeedResult = {
      pair,
      price: String(price),
      decimals: decimalsNum,
      source: 'chainlink',
      chainId: chains[chainName].id,
      updatedAt: updatedAt * 1000 || Date.now(),
    };
    setCached(key, result);
    return result;
  } catch {
    return null;
  }
}

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
};

/**
 * Fetch price from CoinGecko (free API, no key required for simple usage)
 */
export async function getCoinGeckoPrice(pair: string): Promise<PriceFeedResult | null> {
  const key = cacheKey(pair, 'coingecko', 'coingecko');
  const cached = getCached(key);
  if (cached) return cached;

  const [base, quote] = pair.split('/').map((s) => s.trim());
  const id = COINGECKO_IDS[base] ?? base.toLowerCase();
  if (quote !== 'USD') return null;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const usd = data[id]?.usd;
    if (usd == null) return null;
    const result: PriceFeedResult = {
      pair,
      price: String(usd),
      decimals: 8,
      source: 'coingecko',
      updatedAt: Date.now(),
    };
    setCached(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Get price with Chainlink first, fallback to CoinGecko
 */
export async function getPrice(
  pair: string,
  chainName: ChainName = 'baseSepolia'
): Promise<PriceFeedResult | null> {
  const chainlink = await getChainlinkPrice(pair, chainName);
  if (chainlink) return chainlink;
  return getCoinGeckoPrice(pair);
}

/**
 * Observe oracle prices and return Observation array for the agent
 */
export async function observeOraclePrices(
  pairs: string[] = ['ETH/USD'],
  chainName: ChainName = 'baseSepolia'
): Promise<Observation[]> {
  const observations: Observation[] = [];

  for (const pair of pairs) {
    const result = await getPrice(pair, chainName);
    if (result) {
      observations.push({
        id: `oracle-${pair.replace('/', '-')}-${chainName}`,
        timestamp: new Date(result.updatedAt),
        source: 'oracle',
        chainId: result.chainId,
        data: result,
        context: `${pair} price from ${result.source}`,
      });
    }
  }

  return observations;
}
