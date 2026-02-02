/**
 * Aegis Agent - Base Sponsorship Opportunity Observation
 *
 * Observes Base for paymaster sponsorship opportunities: low gas wallets,
 * failed transactions, protocol budgets, agent reserves, gas price.
 */

import { createPublicClient, http, formatEther } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { DatabaseUnavailableError } from '../../errors';
import { logger } from '../../logger';
import { getBalance } from './blockchain';
import { getDefaultChainName } from './chains';
import { getPrice } from './oracles';
import type { Observation } from './index';

const LOW_GAS_THRESHOLD_ETH = 0.0001;
const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

const chains = { base, baseSepolia };
type BaseChainName = keyof typeof chains;

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
    transport: http(rpcUrl ?? 'https://mainnet.base.org'),
  });
}

/**
 * Get on-chain transaction count (nonce) for an address on Base.
 */
export async function getOnchainTxCount(
  address: `0x${string}`,
  chainName: BaseChainName = getDefaultChainName() as BaseChainName
): Promise<number> {
  const client = getBasePublicClient();
  const count = await client.getTransactionCount({ address });
  return Number(count);
}

/**
 * Get protocol budget (USD) from ProtocolSponsor.
 */
export async function getProtocolBudget(
  protocolId: string
): Promise<{ protocolId: string; balanceUSD: number; totalSpent: number } | null> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const proto = await db.protocolSponsor.findUnique({ where: { protocolId } });
    if (!proto) return null;
    return { protocolId, balanceUSD: proto.balanceUSD, totalSpent: proto.totalSpent };
  } catch {
    return null;
  }
}

/**
 * Get all protocol budgets for observation.
 */
export async function getProtocolBudgets(): Promise<
  { protocolId: string; name?: string; balanceUSD: number; totalSpent: number; whitelistedContracts?: string[] }[]
> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const list = await db.protocolSponsor.findMany();
    logger.debug('[Sponsorship] Fetched protocol budgets', { count: list.length });
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

/**
 * Get agent wallet ETH and USDC balances. Uses AGENT_WALLET_ADDRESS.
 */
export async function getAgentWalletBalance(): Promise<{
  ETH: number;
  USDC: number;
  chainId: number;
}> {
  const address = process.env.AGENT_WALLET_ADDRESS as `0x${string}` | undefined;
  const chainName = getDefaultChainName();
  const chainId = chainName === 'base' ? BASE_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;

  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return { ETH: 0, USDC: 0, chainId };
  }

  const ethBalance = await getBalance(address, chainName);
  const ethFormatted = Number(formatEther(ethBalance));

  const usdcAddress = process.env.USDC_ADDRESS as `0x${string}` | undefined;
  let usdcBalance = 0;
  if (usdcAddress && usdcAddress !== '0x0000000000000000000000000000000000000000') {
    try {
      const client = getBasePublicClient();
      const balance = await client.readContract({
        address: usdcAddress,
        abi: [
          { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
          { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
        ] as const,
        functionName: 'balanceOf',
        args: [address],
      });
      const decimals = await client.readContract({
        address: usdcAddress,
        abi: [{ inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' }] as const,
        functionName: 'decimals',
      });
      usdcBalance = Number(balance) / 10 ** Number(decimals);
    } catch {
      // USDC read optional
    }
  }
  return { ETH: ethFormatted, USDC: usdcBalance, chainId };
}

/**
 * Observe current Base gas price.
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
    logger.error('[Sponsorship] Error observing gas price', { error });
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
 * Main entry: observe all Base sponsorship opportunities.
 */
export async function observeBaseSponsorshipOpportunities(): Promise<Observation[]> {
  const [lowGas, failedTxs, newWallets, protocolBudgets, reserves, gasPrice] = await Promise.all([
    observeLowGasWallets(),
    observeFailedTransactions(),
    observeNewWalletActivations(),
    observeProtocolBudgets(),
    observeAgentReserves(),
    observeGasPrice(),
  ]);
  return [...lowGas, ...failedTxs, ...newWallets, ...protocolBudgets, ...reserves, ...gasPrice];
}
