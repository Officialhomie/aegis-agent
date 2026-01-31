/**
 * Aegis Agent - Oracle / Price Feed Observation
 *
 * Chainlink price feeds with CoinGecko API fallback, TTL cache, and rate limiting.
 */

import { LRUCache } from 'lru-cache';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import { getDefaultChainName } from './chains';
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

const CACHE_TTL_MS = Number(process.env.ORACLE_CACHE_TTL_MS) || 60_000;
const CACHE_MAX = Math.min(Number(process.env.ORACLE_CACHE_MAX_ENTRIES) || 500, 2000);

/** Bounded LRU cache for oracle prices (avoids unbounded memory growth) */
const cache = new LRUCache<string, PriceFeedResult>({
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
});

function cacheKey(pair: string, chainName: string, source: string): string {
  return `${source}:${chainName}:${pair}`;
}

function getCached(key: string): PriceFeedResult | null {
  return cache.get(key) ?? null;
}

function setCached(key: string, value: PriceFeedResult): void {
  cache.set(key, value);
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
  chainName: ChainName = getDefaultChainName()
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

/** CoinGecko rate limit: min ms between requests (free tier ~10–30/min) */
const COINGECKO_MIN_INTERVAL_MS = 2000;
let lastCoinGeckoRequest = 0;

function waitCoinGeckoRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCoinGeckoRequest;
  if (elapsed >= COINGECKO_MIN_INTERVAL_MS) return Promise.resolve();
  return new Promise((r) => setTimeout(r, COINGECKO_MIN_INTERVAL_MS - elapsed));
}

async function fetchCoinGeckoWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitCoinGeckoRateLimit();
    lastCoinGeckoRequest = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers,
      });
      if (res.status === 429 && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 10000);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 10000);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

/**
 * Fetch price from CoinGecko. COINGECKO_API_KEY optional (Pro API); rate limiting and retry with backoff.
 */
export async function getCoinGeckoPrice(pair: string): Promise<PriceFeedResult | null> {
  const key = cacheKey(pair, 'coingecko', 'coingecko');
  const cached = getCached(key);
  if (cached) return cached;

  const [baseSymbol, quote] = pair.split('/').map((s) => s.trim());
  const id = COINGECKO_IDS[baseSymbol] ?? baseSymbol.toLowerCase();
  if (quote !== 'USD') return null;

  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = apiKey
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';
  const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-cg-pro-api-key'] = apiKey;

  try {
    const res = await fetchCoinGeckoWithRetry(url, headers);
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
  chainName: ChainName = getDefaultChainName()
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
  chainName: ChainName = getDefaultChainName()
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
