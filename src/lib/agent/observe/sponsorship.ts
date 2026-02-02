/**
 * Aegis Agent - Base Sponsorship Opportunity Observation
 *
 * Observes Base for paymaster sponsorship opportunities: low gas wallets,
 * failed transactions, protocol budgets, agent reserves, gas price.
 */

import { createPublicClient, http, formatEther } from 'viem';
import { base, baseSepolia } from 'viem/chains';
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
  { protocolId: string; name?: string; balanceUSD: number; totalSpent: number }[]
> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const list = await db.protocolSponsor.findMany();
    return list;
  } catch {
    return [];
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

  // USDC: optional - would need token contract read per chain
  const usdcBalance = 0; // TODO: read USDC balance when token address configured
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
    console.error('[Sponsorship] Error observing gas price:', error);
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
 * Observe protocol budgets (x402 balances per protocol). Returns [] until ProtocolSponsor table exists.
 */
export async function observeProtocolBudgets(): Promise<Observation[]> {
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
    },
    context: `Protocol ${p.protocolId} sponsorship budget`,
  }));
}

/**
 * Observe low-gas wallets. Requires candidate addresses (env or future indexer).
 * WHITELISTED_LOW_GAS_CANDIDATES = comma-separated addresses to check.
 */
export async function observeLowGasWallets(): Promise<Observation[]> {
  const candidatesRaw = process.env.WHITELISTED_LOW_GAS_CANDIDATES;
  if (!candidatesRaw?.trim()) return [];

  const addresses = candidatesRaw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('0x') && s.length === 42);
  const client = getBasePublicClient();
  const chain = getDefaultChainName() === 'base' ? base : baseSepolia;
  const observations: Observation[] = [];

  for (const addr of addresses.slice(0, 20)) {
    try {
      const balance = await client.getBalance({ address: addr as `0x${string}` });
      const eth = Number(formatEther(balance));
      if (eth >= LOW_GAS_THRESHOLD_ETH) continue;
      const txCount = await client.getTransactionCount({ address: addr as `0x${string}` });
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
 * Observe recent failed transactions (insufficient gas). Stub: would require indexer or explorer API.
 */
export async function observeFailedTransactions(): Promise<Observation[]> {
  // TODO: integrate with Base indexer or blockscout API for failed txs
  return [];
}

/**
 * Observe new wallet activations (0-tx wallets with pending intents). Stub: would require UserOperation mempool.
 */
export async function observeNewWalletActivations(): Promise<Observation[]> {
  // TODO: detect pending UserOperations for new wallets
  return [];
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
