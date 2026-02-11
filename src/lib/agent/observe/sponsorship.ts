/**
 * Aegis Agent - Base Sponsorship Opportunity Observation
 *
 * Observes Base for paymaster sponsorship opportunities: low gas wallets,
 * ERC-8004 registered agents, failed transactions, protocol budgets, agent reserves, gas price.
 */

import { createPublicClient, decodeEventLog, http, formatEther } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getPrisma } from '../../db';
import {
  DatabaseUnavailableError,
  GasPriceObservationError,
  BalanceObservationError,
  ObservationFailedError,
} from '../../errors';
import { logger } from '../../logger';
import { getBalance, readContract } from './blockchain';
import { getDefaultChainName, getSupportedChainNames, type ChainName } from './chains';
import type { Observation } from './index';
import {
  getCachedProtocolBudget,
  getCachedProtocolBudgets,
  getCachedProtocolWhitelist,
  isCacheEnabled,
} from '../cache';
import { IDENTITY_REGISTRY_ABI } from '../identity/abis/identity-registry';
import { getIdentityRegistryAddress } from '../identity/erc8004';

/**
 * Whether to use strict observation mode (fail on errors).
 * Set OBSERVATION_STRICT_MODE=false to degrade gracefully (not recommended for production).
 */
const STRICT_MODE = process.env.OBSERVATION_STRICT_MODE !== 'false';

const LOW_GAS_THRESHOLD_ETH = 0.01;
const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const ERC8004_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let lastERC8004Discovery:
  | {
      timestamp: number;
      observations: Observation[];
    }
  | null = null;

/** USDC contract address per chain (Base Sepolia, Base Mainnet). */
function getUsdcAddressForChain(chainName: string): `0x${string}` | undefined {
  const addr =
    chainName === 'baseSepolia'
      ? (process.env.USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e')
      : chainName === 'base'
        ? (process.env.USDC_ADDRESS_BASE_MAINNET ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
        : process.env.USDC_ADDRESS;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return undefined;
  return addr as `0x${string}`;
}

type BaseChainName = 'base' | 'baseSepolia';

const BASE_RPC_TIMEOUT_MS = Number(process.env.BASE_RPC_TIMEOUT_MS) || 30_000;

function getBasePublicClient() {
  const rpcUrl =
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    (getDefaultChainName() === 'base'
      ? process.env.RPC_URL_BASE
      : process.env.RPC_URL_BASE_SEPOLIA);
  const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(rpcUrl ?? 'https://mainnet.base.org', { timeout: BASE_RPC_TIMEOUT_MS }),
  });
}

/**
 * Observe ERC-8004 registered agents on Base and return low-gas agent wallets as candidates.
 * Uses Identity Registry Registered events over a small block window to respect RPC limits.
 */
export async function observeERC8004RegisteredAgents(): Promise<Observation[]> {
  // Simple in-process cache to avoid repeated log scans.
  if (lastERC8004Discovery && Date.now() - lastERC8004Discovery.timestamp < ERC8004_DISCOVERY_CACHE_TTL_MS) {
    return lastERC8004Discovery.observations;
  }

  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) {
    logger.debug('[Sponsorship] ERC-8004 registry not configured - skipping agent discovery');
    return [];
  }

  const rpcUrl =
    process.env.ERC8004_RPC_URL?.trim() ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_8453;
  if (!rpcUrl) {
    logger.warn('[Sponsorship] ERC-8004 discovery skipped - no RPC URL configured for Base');
    return [];
  }

  try {
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl, { timeout: BASE_RPC_TIMEOUT_MS }),
    });

    // Respect Alchemy free-tier 10-block eth_getLogs limit by defaulting to the last 10 blocks.
    const latestBlock = await client.getBlockNumber();
    let fromBlock: bigint;
    const fromBlockEnv = process.env.ERC8004_DISCOVERY_FROM_BLOCK?.trim();
    if (fromBlockEnv) {
      try {
        fromBlock = fromBlockEnv.startsWith('0x') ? BigInt(fromBlockEnv) : BigInt(Number(fromBlockEnv));
      } catch {
        fromBlock = latestBlock > BigInt(9) ? latestBlock - BigInt(9) : BigInt(0);
      }
    } else {
      fromBlock = latestBlock > BigInt(9) ? latestBlock - BigInt(9) : BigInt(0);
    }

    const logs = await client.getLogs({
      address: registryAddress,
      fromBlock,
      toBlock: latestBlock,
    });

    const agentWallets = new Map<string, bigint>();

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Registered') {
          const { agentId, owner } = decoded.args as { agentId: bigint; owner: `0x${string}` };
          if (owner && typeof owner === 'string') {
            agentWallets.set(owner.toLowerCase(), agentId);
          }
        }
      } catch {
        // Ignore non-Registered events or decode failures.
        continue;
      }
    }

    if (agentWallets.size === 0) {
      logger.debug('[Sponsorship] No ERC-8004 Registered events found in discovery window', {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${latestBlock.toString(16)}`,
      });
      lastERC8004Discovery = { timestamp: Date.now(), observations: [] };
      return [];
    }

    const agentWalletAddress = process.env.AGENT_WALLET_ADDRESS?.toLowerCase();
    const observations: Observation[] = [];

    for (const [wallet, agentId] of agentWallets.entries()) {
      // Never consider the agent's own wallet as a sponsorship candidate.
      if (agentWalletAddress && wallet === agentWalletAddress.toLowerCase()) continue;

      try {
        const balance = await client.getBalance({ address: wallet as `0x${string}` });
        const eth = Number(formatEther(balance));
        if (eth >= LOW_GAS_THRESHOLD_ETH) continue;

        const txCount = await client.getTransactionCount({ address: wallet as `0x${string}` });
        observations.push({
          id: `lowgas-erc8004-${wallet}-${Date.now()}`,
          timestamp: new Date(),
          source: 'event',
          chainId: base.id,
          data: {
            walletAddress: wallet,
            balanceETH: eth,
            historicalTxCount: Number(txCount),
            belowThreshold: true,
            erc8004AgentId: agentId.toString(),
          },
          context: `ERC-8004 registered agent with low gas (${eth} ETH, agentId ${agentId.toString()})`,
        });
      } catch (error) {
        logger.warn('[Sponsorship] Failed to evaluate ERC-8004 agent wallet for sponsorship', {
          wallet,
          agentId: agentId.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('[Sponsorship] ERC-8004 agent discovery complete', {
      discoveredAgents: agentWallets.size,
      lowGasAgents: observations.length,
    });

    lastERC8004Discovery = { timestamp: Date.now(), observations };
    return observations;
  } catch (error) {
    logger.warn('[Sponsorship] ERC-8004 agent discovery failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get on-chain transaction count (nonce) for an address on Base.
 */
export async function getOnchainTxCount(
  address: `0x${string}`,
  _chainName: BaseChainName = getDefaultChainName() as BaseChainName
): Promise<number> {
  void _chainName; // reserved for multi-chain
  const client = getBasePublicClient();
  const count = await client.getTransactionCount({ address });
  return Number(count);
}

/**
 * Get protocol budget (USD) from ProtocolSponsor with caching.
 * IMPORTANT: Throws DatabaseUnavailableError on DB failure (fail-closed).
 *
 * Cache: Write-through strategy, 60s TTL
 * Performance: <5ms cache hit, ~50ms cache miss
 */
export async function getProtocolBudget(
  protocolId: string
): Promise<{ protocolId: string; balanceUSD: number; totalSpent: number } | null> {
  try {
    // Try cache first if enabled
    if (isCacheEnabled()) {
      const cached = await getCachedProtocolBudget(protocolId);
      if (cached) {
        return { protocolId, ...cached };
      }
    }

    // Cache miss or disabled - fetch from database
    const db = getPrisma();
    const proto = await db.protocolSponsor.findUnique({ where: { protocolId } });
    if (!proto) return null;
    return { protocolId, balanceUSD: proto.balanceUSD, totalSpent: proto.totalSpent };
  } catch (error) {
    logger.error('[Sponsorship] getProtocolBudget failed - database unavailable', {
      error,
      protocolId,
      severity: 'CRITICAL',
      impact: 'Cannot verify protocol budget - sponsorship blocked',
    });
    throw new DatabaseUnavailableError(
      `Cannot fetch protocol budget for ${protocolId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all protocol budgets for observation with batch caching.
 *
 * Cache: Batch read optimization, 60s TTL per protocol
 * Performance: ~10ms for 10 protocols (cached), ~100ms (uncached)
 */
export async function getProtocolBudgets(): Promise<
  { protocolId: string; name?: string; balanceUSD: number; totalSpent: number; whitelistedContracts?: string[] }[]
> {
  try {
    const db = getPrisma();

    // First get all protocol IDs and metadata from database
    const protocols = await db.protocolSponsor.findMany({
      select: {
        protocolId: true,
        name: true,
        whitelistedContracts: true,
      },
    });

    if (protocols.length === 0) {
      return [];
    }

    // Batch get budgets from cache (single round-trip)
    if (isCacheEnabled()) {
      const protocolIds = protocols.map((p) => p.protocolId);
      const cachedBudgets = await getCachedProtocolBudgets(protocolIds);

      // Merge cached budgets with protocol metadata
      const result = protocols.map((p) => {
        const budget = cachedBudgets.get(p.protocolId);
        return {
          protocolId: p.protocolId,
          name: p.name,
          balanceUSD: budget?.balanceUSD ?? 0,
          totalSpent: budget?.totalSpent ?? 0,
          whitelistedContracts: p.whitelistedContracts,
        };
      });

      logger.debug('[Sponsorship] Fetched protocol budgets (cached)', {
        count: result.length,
        cacheHits: cachedBudgets.size,
      });
      return result;
    }

    // Cache disabled - fallback to direct database query
    const list = await db.protocolSponsor.findMany();
    logger.debug('[Sponsorship] Fetched protocol budgets (no cache)', { count: list.length });
    return list;
  } catch (error) {
    logger.error('[Sponsorship] Cannot fetch protocol budgets - database unavailable', {
      error,
      severity: 'HIGH',
      impact: 'Agent cannot observe protocol budget status',
    });
    throw new DatabaseUnavailableError('Cannot fetch protocol budgets');
  }
}

const ERC20_BALANCE_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
] as const;

export interface MultiChainBalance {
  chainId: number;
  chainName: string;
  ETH: number;
  USDC: number;
}

/**
 * Get agent wallet ETH and USDC balances for all supported chains (e.g. Base Sepolia and Base Mainnet).
 * Uses AGENT_WALLET_ADDRESS and per-chain USDC addresses (USDC_ADDRESS, USDC_ADDRESS_BASE_MAINNET).
 *
 * IMPORTANT: In STRICT_MODE, throws BalanceObservationError if ETH balance cannot be fetched.
 * USDC balance failures are logged but don't block (USDC is optional).
 */
export async function getAgentWalletBalances(): Promise<MultiChainBalance[]> {
  const address = process.env.AGENT_WALLET_ADDRESS as `0x${string}` | undefined;
  const chainIdByName: Record<string, number> = { base: BASE_CHAIN_ID, baseSepolia: BASE_SEPOLIA_CHAIN_ID };
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    logger.warn('[Sponsorship] AGENT_WALLET_ADDRESS not set - returning zero balances');
    return getSupportedChainNames().map((name) => ({
      chainId: chainIdByName[name] ?? BASE_SEPOLIA_CHAIN_ID,
      chainName: name,
      ETH: 0,
      USDC: 0,
    }));
  }

  const chainNames = getSupportedChainNames();
  const results: MultiChainBalance[] = [];
  let ethFetchFailed = false;
  let ethFetchError: Error | undefined;

  for (const chainName of chainNames) {
    const chainId = chainIdByName[chainName] ?? BASE_SEPOLIA_CHAIN_ID;
    let ethFormatted = 0;
    let usdcBalance = 0;

    // ETH balance is critical - track failures
    try {
      const ethBalance = await getBalance(address, chainName as ChainName);
      ethFormatted = Number(formatEther(ethBalance));
    } catch (error) {
      ethFetchFailed = true;
      ethFetchError = error instanceof Error ? error : new Error(String(error));
      logger.error('[Sponsorship] Failed to fetch ETH balance', {
        address,
        chainName,
        chainId,
        error: ethFetchError.message,
        severity: 'CRITICAL',
        impact: 'Cannot determine agent reserves for sponsorship',
      });
    }

    // USDC balance is optional - log but don't block
    const usdcAddress = getUsdcAddressForChain(chainName);
    if (usdcAddress) {
      try {
        const balance = await readContract(
          usdcAddress,
          ERC20_BALANCE_ABI as unknown as import('viem').Abi,
          'balanceOf',
          [address],
          chainName as ChainName
        );
        const decimals = await readContract(
          usdcAddress,
          ERC20_BALANCE_ABI as unknown as import('viem').Abi,
          'decimals',
          [],
          chainName as ChainName
        );
        usdcBalance = Number(balance) / 10 ** Number(decimals);
      } catch (error) {
        logger.warn('[Sponsorship] Failed to fetch USDC balance (non-critical)', {
          address,
          chainName,
          usdcAddress,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    results.push({ chainId, chainName, ETH: ethFormatted, USDC: usdcBalance });
  }

  // In strict mode, fail if we couldn't fetch ETH balance
  if (STRICT_MODE && ethFetchFailed) {
    throw new BalanceObservationError(
      `Failed to fetch ETH balance for agent wallet: ${ethFetchError?.message ?? 'unknown error'}`,
      { address }
    );
  }

  return results;
}

/**
 * Get agent wallet ETH and USDC balance for the default chain only (backward compatible).
 */
export async function getAgentWalletBalance(): Promise<{
  ETH: number;
  USDC: number;
  chainId: number;
}> {
  const balances = await getAgentWalletBalances();
  const first = balances[0];
  if (!first) {
    return { ETH: 0, USDC: 0, chainId: getDefaultChainName() === 'base' ? BASE_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID };
  }
  return { ETH: first.ETH, USDC: first.USDC, chainId: first.chainId };
}

/**
 * Observe current Base gas price.
 * IMPORTANT: In STRICT_MODE, throws GasPriceObservationError on failure.
 * Gas price is critical for sponsorship timing decisions.
 */
export async function observeGasPrice(): Promise<Observation[]> {
  const client = getBasePublicClient();
  const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
  try {
    const gasPrice = await client.getGasPrice();
    const gasPriceGwei = formatEther(gasPrice * BigInt(1e9));
    return [
      {
        id: `gas-base-${Date.now()}`,
        timestamp: new Date(),
        source: 'blockchain',
        chainId: chain.id,
        data: {
          gasPrice: gasPrice.toString(),
          gasPriceGwei,
          chainId: chain.id,
        },
        context: 'Current Base gas price for sponsorship timing',
      },
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[Sponsorship] Failed to observe gas price', {
      error: message,
      chainId: chain.id,
      severity: 'HIGH',
      impact: 'Cannot determine optimal sponsorship timing',
    });

    if (STRICT_MODE) {
      throw new GasPriceObservationError(
        `Failed to observe gas price on chain ${chain.id}: ${message}`
      );
    }

    // Degraded mode: return empty (not recommended for production)
    return [];
  }
}

/**
 * Observe agent ETH/USDC reserves (sponsorship capacity).
 */
export async function observeAgentReserves(): Promise<Observation[]> {
  const reserves = await getAgentWalletBalance();
  return [
    {
      id: `reserves-${Date.now()}`,
      timestamp: new Date(),
      source: 'blockchain',
      chainId: reserves.chainId,
      data: {
        agentReservesETH: reserves.ETH,
        agentReservesUSDC: reserves.USDC,
        chainId: reserves.chainId,
      },
      context: 'Agent wallet reserves for paymaster capacity',
    },
  ];
}

/**
 * Observe protocol budgets (x402 balances per protocol) with whitelisted contracts.
 */
export async function observeProtocolBudgets(): Promise<Observation[]> {
  try {
    const protocols = await getProtocolBudgets();
    return protocols.map((p) => ({
      id: `protocol-budget-${p.protocolId}-${Date.now()}`,
      timestamp: new Date(),
      source: 'api',
      data: {
        protocolId: p.protocolId,
        name: p.name,
        balanceUSD: p.balanceUSD,
        totalSpent: p.totalSpent,
        whitelistedContracts: p.whitelistedContracts ?? [],
      },
      context: `Protocol ${p.protocolId} sponsorship budget (${(p.whitelistedContracts ?? []).length} whitelisted contracts)`,
    }));
  } catch (error) {
    logger.error('[Sponsorship] Cannot observe protocol budgets', { error, severity: 'HIGH' });
    throw error;
  }
}

/** Min historical txs for legitimacy when using Blockscout discovery */
const MIN_TX_COUNT_FOR_LEGITIMACY = 5;
/** Max candidates to check when discovering from Blockscout */
const MAX_DISCOVERY_CANDIDATES = 25;

/**
 * Fetch recent transaction senders from Blockscout API (optional).
 * Set BLOCKSCOUT_API_URL (e.g. https://base.blockscout.com) to enable.
 */
async function fetchRecentSendersFromBlockscout(): Promise<string[]> {
  const baseUrl = process.env.BLOCKSCOUT_API_URL?.trim();
  if (!baseUrl) {
    logger.debug('[Sponsorship] Blockscout not configured - skipping sender lookup');
    return [];
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/transactions?page=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      logger.warn('[Sponsorship] Blockscout API request failed', { status: res.status, url: baseUrl });
      return [];
    }
    const data = (await res.json()) as { items?: { from?: { hash?: string } }[] };
    const items = data?.items ?? [];
    const senders = new Set<string>();
    for (const item of items) {
      const from = item?.from?.hash ?? (item as { from?: string }).from;
      if (typeof from === 'string' && from.startsWith('0x') && from.length === 42) senders.add(from.toLowerCase());
    }
    logger.debug('[Sponsorship] Fetched recent senders from Blockscout', { count: senders.size });
    return Array.from(senders).slice(0, MAX_DISCOVERY_CANDIDATES);
  } catch (error) {
    logger.warn('[Sponsorship] Blockscout API fetch failed', {
      error,
      impact: 'Cannot discover low-gas wallets via Blockscout - degraded functionality',
    });
    return [];
  }
}

/**
 * Observe low-gas wallets. Uses BLOCKSCOUT_API_URL for discovery when set;
 * otherwise WHITELISTED_LOW_GAS_CANDIDATES (comma-separated addresses).
 */
export async function observeLowGasWallets(): Promise<Observation[]> {
  let addresses: string[] = [];
  const candidatesRaw = process.env.WHITELISTED_LOW_GAS_CANDIDATES?.trim();
  if (candidatesRaw) {
    addresses = candidatesRaw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('0x') && s.length === 42);
  }
  if (addresses.length === 0) {
    addresses = await fetchRecentSendersFromBlockscout();
  }
  if (addresses.length === 0) return [];

  const client = getBasePublicClient();
  const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
  const observations: Observation[] = [];

  for (const addr of addresses.slice(0, 20)) {
    try {
      const balance = await client.getBalance({ address: addr as `0x${string}` });
      const eth = Number(formatEther(balance));
      if (eth >= LOW_GAS_THRESHOLD_ETH) continue;
      const txCount = await client.getTransactionCount({ address: addr as `0x${string}` });
      if (process.env.BLOCKSCOUT_API_URL && txCount < MIN_TX_COUNT_FOR_LEGITIMACY) continue;
      observations.push({
        id: `lowgas-${addr}-${Date.now()}`,
        timestamp: new Date(),
        source: 'blockchain',
        chainId: chain.id,
        data: {
          walletAddress: addr,
          balanceETH: eth,
          historicalTxCount: Number(txCount),
          belowThreshold: true,
        },
        context: `Low gas wallet candidate (${eth} ETH, ${txCount} txs)`,
      });
    } catch {
      // Skip failed address
    }
  }
  return observations;
}

/**
 * Observe recent failed transactions (insufficient gas). Uses Blockscout API when BLOCKSCOUT_API_URL set.
 */
export async function observeFailedTransactions(): Promise<Observation[]> {
  const baseUrl = process.env.BLOCKSCOUT_API_URL?.trim();
  if (!baseUrl) return [];

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/transactions?status=error&page=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      logger.warn('[Sponsorship] Blockscout failed-transactions API request failed', {
        status: res.status,
        url: baseUrl,
      });
      return [];
    }
    const data = (await res.json()) as { items?: { from?: { hash?: string }; tx_error?: string }[] };
    const items = (data?.items ?? []).slice(0, 15);
    const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
    return items.map((item, i) => {
      const from = item?.from?.hash ?? (item as { from?: string }).from ?? '0x0';
      return {
        id: `failed-tx-${i}-${Date.now()}`,
        timestamp: new Date(),
        source: 'api',
        chainId: chain.id,
        data: {
          agentWallet: from,
          reason: (item as { tx_error?: string }).tx_error ?? 'error',
          status: 'error',
        },
        context: 'Failed transaction (agent execution failure)',
      };
    });
  } catch (error) {
    logger.warn('[Sponsorship] Blockscout failed-transactions fetch failed', {
      error,
      impact: 'Cannot observe failed transactions - degraded functionality',
    });
    return [];
  }
}

/**
 * Observe new wallet activations (0-tx wallets with pending intents). Stub: returns [] unless WHITELISTED_LOW_GAS_CANDIDATES includes new wallets.
 * Full implementation would require UserOperation mempool (Pimlico bundler) subscription.
 */
export async function observeNewWalletActivations(): Promise<Observation[]> {
  const candidatesRaw = process.env.WHITELISTED_NEW_WALLET_CANDIDATES?.trim();
  if (!candidatesRaw) return [];

  const addresses = candidatesRaw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('0x') && s.length === 42);
  const client = getBasePublicClient();
  const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
  const observations: Observation[] = [];

  for (const addr of addresses.slice(0, 10)) {
    try {
      const txCount = await client.getTransactionCount({ address: addr as `0x${string}` });
      if (txCount > 0) continue;
      const balance = await client.getBalance({ address: addr as `0x${string}` });
      const eth = Number(formatEther(balance));
      observations.push({
        id: `new-wallet-${addr}-${Date.now()}`,
        timestamp: new Date(),
        source: 'blockchain',
        chainId: chain.id,
        data: {
          walletAddress: addr,
          balanceETH: eth,
          historicalTxCount: 0,
          pendingIntent: true,
        },
        context: 'New wallet (0 txs) with potential pending intent',
      });
    } catch {
      // Skip
    }
  }
  return observations;
}

/**
 * Observe agents with active delegations that have remaining gas budget.
 * Prioritizes delegated agents for sponsorship since they have user-allocated budgets.
 *
 * Only runs when DELEGATION_ENABLED=true.
 */
export async function observeDelegatedAgentOpportunities(): Promise<Observation[]> {
  if (process.env.DELEGATION_ENABLED !== 'true') {
    return [];
  }

  try {
    const db = getPrisma();
    const client = getBasePublicClient();
    const chain = getDefaultChainName() === 'base' ? base : baseSepolia;

    // Find active delegations with remaining budget
    const activeDelegations = await db.delegation.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: { gt: new Date() },
        validFrom: { lte: new Date() },
      },
      select: {
        id: true,
        agent: true,
        delegator: true,
        gasBudgetWei: true,
        gasBudgetSpent: true,
        permissions: true,
        validUntil: true,
        agentOnChainId: true,
      },
      take: 50, // Limit to prevent excessive RPC calls
    });

    if (activeDelegations.length === 0) {
      logger.debug('[Sponsorship] No active delegations found');
      return [];
    }

    const observations: Observation[] = [];
    const agentWalletAddress = process.env.AGENT_WALLET_ADDRESS?.toLowerCase();

    for (const delegation of activeDelegations) {
      // Skip if this is the agent's own wallet
      if (agentWalletAddress && delegation.agent.toLowerCase() === agentWalletAddress) {
        continue;
      }

      // Check remaining budget
      const remaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;
      if (remaining <= BigInt(0)) {
        continue;
      }

      try {
        // Check agent's ETH balance
        const balance = await client.getBalance({ address: delegation.agent as `0x${string}` });
        const eth = Number(formatEther(balance));

        // Only observe if agent has low gas (needs sponsorship)
        if (eth >= LOW_GAS_THRESHOLD_ETH) {
          continue;
        }

        const remainingEth = Number(formatEther(BigInt(remaining.toString())));
        observations.push({
          id: `delegation-${delegation.id}-${Date.now()}`,
          timestamp: new Date(),
          source: 'delegation',
          chainId: chain.id,
          data: {
            walletAddress: delegation.agent,
            delegator: delegation.delegator,
            delegationId: delegation.id,
            balanceETH: eth,
            remainingBudgetWei: remaining.toString(),
            validUntil: delegation.validUntil.toISOString(),
            agentOnChainId: delegation.agentOnChainId,
            belowThreshold: true,
          },
          context: `Delegated agent with user gas budget (${eth} ETH, ${remainingEth} ETH budget remaining)`,
        });
      } catch (error) {
        logger.warn('[Sponsorship] Failed to check delegated agent balance', {
          delegationId: delegation.id,
          agent: delegation.agent,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('[Sponsorship] Delegated agent observation complete', {
      activeDelegations: activeDelegations.length,
      lowGasAgents: observations.length,
    });

    return observations;
  } catch (error) {
    logger.warn('[Sponsorship] Delegated agent observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export interface ObservationHealthSummary {
  healthy: boolean;
  criticalFailures: string[];
  warnings: string[];
  observationCounts: {
    lowGas: number;
    failedTxs: number;
    newWallets: number;
    protocolBudgets: number;
    reserves: number;
    gasPrice: number;
  };
}

/**
 * Main entry: observe all Base sponsorship opportunities.
 * In STRICT_MODE, throws on critical observation failures (protocol budgets, reserves, gas price).
 * Non-critical observations (low gas discovery, failed txs) degrade gracefully.
 */
export async function observeBaseSponsorshipOpportunities(): Promise<Observation[]> {
  const results: {
    lowGas: Observation[];
    erc8004Agents: Observation[];
    delegatedAgents: Observation[];
    failedTxs: Observation[];
    newWallets: Observation[];
    protocolBudgets: Observation[];
    reserves: Observation[];
    gasPrice: Observation[];
  } = {
    lowGas: [],
    erc8004Agents: [],
    delegatedAgents: [],
    failedTxs: [],
    newWallets: [],
    protocolBudgets: [],
    reserves: [],
    gasPrice: [],
  };

  const errors: { type: string; error: Error; critical: boolean }[] = [];

  // Non-critical observations - degrade gracefully
  try {
    results.lowGas = await observeLowGasWallets();
  } catch (error) {
    errors.push({ type: 'lowGas', error: error as Error, critical: false });
    logger.warn('[Sponsorship] Low gas wallet observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.erc8004Agents = await observeERC8004RegisteredAgents();
  } catch (error) {
    errors.push({ type: 'erc8004Agents', error: error as Error, critical: false });
    logger.warn('[Sponsorship] ERC-8004 agent observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.delegatedAgents = await observeDelegatedAgentOpportunities();
  } catch (error) {
    errors.push({ type: 'delegatedAgents', error: error as Error, critical: false });
    logger.warn('[Sponsorship] Delegated agent observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.failedTxs = await observeFailedTransactions();
  } catch (error) {
    errors.push({ type: 'failedTxs', error: error as Error, critical: false });
    logger.warn('[Sponsorship] Failed transactions observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.newWallets = await observeNewWalletActivations();
  } catch (error) {
    errors.push({ type: 'newWallets', error: error as Error, critical: false });
    logger.warn('[Sponsorship] New wallet observation failed (degraded)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Critical observations - throw in STRICT_MODE
  try {
    results.protocolBudgets = await observeProtocolBudgets();
  } catch (error) {
    errors.push({ type: 'protocolBudgets', error: error as Error, critical: true });
    if (STRICT_MODE) throw error;
    logger.error('[Sponsorship] Protocol budgets observation failed (CRITICAL)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.reserves = await observeAgentReserves();
  } catch (error) {
    errors.push({ type: 'reserves', error: error as Error, critical: true });
    if (STRICT_MODE) throw error;
    logger.error('[Sponsorship] Agent reserves observation failed (CRITICAL)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.gasPrice = await observeGasPrice();
  } catch (error) {
    errors.push({ type: 'gasPrice', error: error as Error, critical: true });
    if (STRICT_MODE) throw error;
    logger.error('[Sponsorship] Gas price observation failed (CRITICAL)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Log observation summary
  logger.info('[Sponsorship] Observation cycle complete', {
    counts: {
      lowGas: results.lowGas.length,
      erc8004Agents: results.erc8004Agents.length,
      delegatedAgents: results.delegatedAgents.length,
      failedTxs: results.failedTxs.length,
      newWallets: results.newWallets.length,
      protocolBudgets: results.protocolBudgets.length,
      reserves: results.reserves.length,
      gasPrice: results.gasPrice.length,
    },
    errors: errors.length,
    criticalErrors: errors.filter((e) => e.critical).length,
  });

  return [
    ...results.lowGas,
    ...results.erc8004Agents,
    ...results.delegatedAgents,
    ...results.failedTxs,
    ...results.newWallets,
    ...results.protocolBudgets,
    ...results.reserves,
    ...results.gasPrice,
  ];
}

/**
 * Get observation health summary without running observations.
 * Useful for health checks and dashboard status.
 */
export async function getObservationHealthStatus(): Promise<ObservationHealthSummary> {
  const criticalFailures: string[] = [];
  const warnings: string[] = [];
  const counts = {
    lowGas: 0,
    failedTxs: 0,
    newWallets: 0,
    protocolBudgets: 0,
    reserves: 0,
    gasPrice: 0,
  };

  // Test critical observations
  try {
    const budgets = await getProtocolBudgets();
    counts.protocolBudgets = budgets.length;
  } catch (error) {
    criticalFailures.push(`protocolBudgets: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const balance = await getAgentWalletBalance();
    counts.reserves = 1;
    if (balance.ETH === 0) {
      warnings.push('Agent ETH balance is 0');
    }
  } catch (error) {
    criticalFailures.push(`reserves: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const gasObs = await observeGasPrice();
    counts.gasPrice = gasObs.length;
  } catch (error) {
    criticalFailures.push(`gasPrice: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    healthy: criticalFailures.length === 0,
    criticalFailures,
    warnings,
    observationCounts: counts,
  };
}
