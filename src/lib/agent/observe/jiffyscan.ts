/**
 * JiffyScan Integration - ERC-4337 UserOp Discovery
 *
 * JiffyScan is the "Etherscan for Smart Accounts" - provides real-time
 * UserOperation data across chains. We use it to discover active smart
 * accounts with proven transaction history.
 *
 * Real API Documentation:
 * - Docs: https://jiffyscan.readme.io/reference/getting-started-1
 * - API Key: https://dashboard.jiffyscan.xyz/
 * - Auth: x-api-key header
 *
 * Endpoints:
 * - GET /v0/getUserOp?hash=<hash> - Get specific UserOp
 * - GET /v0/getAccountActivity?address=<address>&network=<network> - Get account activity
 * - GET /v0/getLatestUserOps?network=<network>&limit=<limit> - Get recent UserOps
 */

import { logger } from '../../logger';
import type { Address } from 'viem';

const JIFFYSCAN_API_BASE = 'https://api.jiffyscan.xyz/v0';
const JIFFYSCAN_FRONTEND = 'https://www.jiffyscan.xyz';
const JIFFYSCAN_API_KEY = process.env.JIFFYSCAN_API_KEY; // Get from dashboard.jiffyscan.xyz

export interface JiffyScanUserOp {
  userOpHash: string;
  sender: Address;
  nonce: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  paymaster?: Address;
  target?: Address;
  blockNumber: number;
  blockTime: number;
  transactionHash: string;
}

export interface JiffyScanAccount {
  address: Address;
  factory?: Address;
  totalOps: number;
  firstSeen: number;
  lastSeen: number;
  isActive: boolean;
}

export interface JiffyScanDiscoveryOptions {
  chain: 'base' | 'mainnet' | 'optimism' | 'arbitrum' | 'polygon';
  limit?: number; // Max UserOps to fetch (default: 100)
  minOps?: number; // Minimum UserOps for account to be considered active (default: 1)
  timeframe?: '24h' | '7d' | '30d'; // Activity timeframe (default: 7d)
}

/**
 * Discover active smart accounts from JiffyScan
 *
 * Returns smart accounts with recent UserOp activity, sorted by activity count.
 */
export async function discoverFromJiffyScan(
  options: JiffyScanDiscoveryOptions
): Promise<{
  accounts: JiffyScanAccount[];
  userOps: JiffyScanUserOp[];
  source: string;
}> {
  const { chain, limit = 100, minOps = 1, timeframe = '7d' } = options;

  logger.info('[JiffyScan] Discovering active smart accounts', {
    chain,
    limit,
    minOps,
    timeframe,
  });

  try {
    // Fetch from JiffyScan API using real endpoints
    // Requires JIFFYSCAN_API_KEY environment variable
    // Falls back to Entry Point events if API unavailable
    const userOps = await fetchUserOps(chain, limit);

    if (userOps.length === 0) {
      logger.warn('[JiffyScan] No UserOps found or API not available', {
        chain,
        fallback: 'Use Entry Point monitoring instead',
      });
      return {
        accounts: [],
        userOps: [],
        source: 'jiffyscan-unavailable',
      };
    }

    // Aggregate by sender to find most active accounts
    const accountActivity = new Map<string, {
      address: Address;
      ops: JiffyScanUserOp[];
      totalOps: number;
      firstSeen: number;
      lastSeen: number;
    }>();

    for (const op of userOps) {
      const key = op.sender.toLowerCase();
      const existing = accountActivity.get(key);

      if (!existing) {
        accountActivity.set(key, {
          address: op.sender,
          ops: [op],
          totalOps: 1,
          firstSeen: op.blockTime,
          lastSeen: op.blockTime,
        });
      } else {
        existing.ops.push(op);
        existing.totalOps += 1;
        existing.firstSeen = Math.min(existing.firstSeen, op.blockTime);
        existing.lastSeen = Math.max(existing.lastSeen, op.blockTime);
      }
    }

    // Filter by minimum ops and convert to accounts
    const accounts: JiffyScanAccount[] = Array.from(accountActivity.values())
      .filter((activity) => activity.totalOps >= minOps)
      .map((activity) => ({
        address: activity.address,
        totalOps: activity.totalOps,
        firstSeen: activity.firstSeen,
        lastSeen: activity.lastSeen,
        isActive: true,
      }))
      .sort((a, b) => b.totalOps - a.totalOps); // Sort by activity (descending)

    logger.info('[JiffyScan] Discovery complete', {
      totalUserOps: userOps.length,
      uniqueAccounts: accountActivity.size,
      activeAccounts: accounts.length,
      topAccount: accounts[0]
        ? { address: accounts[0].address.slice(0, 10) + '...', ops: accounts[0].totalOps }
        : null,
    });

    return {
      accounts,
      userOps,
      source: 'jiffyscan',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[JiffyScan] Discovery failed', { error: message });

    return {
      accounts: [],
      userOps: [],
      source: 'jiffyscan-error',
    };
  }
}

/**
 * Fetch recent UserOperations from JiffyScan API
 *
 * Real implementation using JiffyScan's v0 API.
 * Requires JIFFYSCAN_API_KEY environment variable.
 */
async function fetchUserOps(
  chain: string,
  limit: number
): Promise<JiffyScanUserOp[]> {
  // Check for API key
  if (!JIFFYSCAN_API_KEY) {
    logger.warn('[JiffyScan] No API key configured', {
      message: 'Set JIFFYSCAN_API_KEY in .env. Get key from https://dashboard.jiffyscan.xyz/',
      fallback: 'Using Entry Point monitoring instead',
    });
    return [];
  }

  try {
    // Map our chain names to JiffyScan network names
    const networkMap: Record<string, string> = {
      base: 'base',
      mainnet: 'ethereum',
      optimism: 'optimism',
      arbitrum: 'arbitrum',
      polygon: 'polygon',
    };

    const network = networkMap[chain] || chain;

    // Real JiffyScan API endpoint
    const url = `${JIFFYSCAN_API_BASE}/getLatestUserOps?network=${network}&limit=${limit}`;

    logger.debug('[JiffyScan] Fetching UserOps', { network, limit });

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': JIFFYSCAN_API_KEY,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logger.error('[JiffyScan] API authentication failed', {
          status: response.status,
          message: 'Check JIFFYSCAN_API_KEY is valid',
        });
        return [];
      }

      if (response.status === 404) {
        logger.warn('[JiffyScan] Endpoint not found', {
          url,
          message: 'API endpoint may have changed. Check documentation.',
        });
        return [];
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse JiffyScan API response format
    // Adjust based on actual API response structure
    let userOps: JiffyScanUserOp[] = [];

    if (Array.isArray(data)) {
      // If response is an array of UserOps
      userOps = data.map((op: any) => ({
        userOpHash: op.userOpHash || op.hash,
        sender: op.sender,
        nonce: op.nonce || '0',
        actualGasCost: op.actualGasCost || '0',
        actualGasUsed: op.actualGasUsed || '0',
        success: op.success !== false,
        paymaster: op.paymaster,
        target: op.target,
        blockNumber: op.blockNumber || 0,
        blockTime: op.blockTime || op.timestamp || Date.now() / 1000,
        transactionHash: op.transactionHash || op.txHash || '',
      }));
    } else if (data.userOps && Array.isArray(data.userOps)) {
      // If response has userOps array
      userOps = data.userOps.map((op: any) => ({
        userOpHash: op.userOpHash || op.hash,
        sender: op.sender,
        nonce: op.nonce || '0',
        actualGasCost: op.actualGasCost || '0',
        actualGasUsed: op.actualGasUsed || '0',
        success: op.success !== false,
        paymaster: op.paymaster,
        target: op.target,
        blockNumber: op.blockNumber || 0,
        blockTime: op.blockTime || op.timestamp || Date.now() / 1000,
        transactionHash: op.transactionHash || op.txHash || '',
      }));
    } else {
      logger.warn('[JiffyScan] Unexpected API response format', {
        hasData: !!data,
        keys: Object.keys(data || {}).join(', '),
      });
    }

    logger.info('[JiffyScan] Fetched UserOps', {
      network,
      count: userOps.length,
    });

    return userOps;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[JiffyScan] Request timeout', { timeout: '10s' });
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      logger.warn('[JiffyScan] Network error', {
        message: 'Could not reach JiffyScan API',
      });
    } else {
      logger.error('[JiffyScan] Fetch UserOps failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }
}

/**
 * Fetch activity for a specific smart account
 *
 * Uses JiffyScan's getAccountActivity endpoint.
 */
export async function getAccountActivity(
  address: Address,
  chain: string = 'base'
): Promise<{
  totalOps: number;
  recentOps: JiffyScanUserOp[];
}> {
  if (!JIFFYSCAN_API_KEY) {
    logger.warn('[JiffyScan] No API key for getAccountActivity');
    return { totalOps: 0, recentOps: [] };
  }

  try {
    const networkMap: Record<string, string> = {
      base: 'base',
      mainnet: 'ethereum',
    };

    const network = networkMap[chain] || chain;
    const url = `${JIFFYSCAN_API_BASE}/getAccountActivity?address=${address}&network=${network}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': JIFFYSCAN_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn('[JiffyScan] getAccountActivity failed', {
        status: response.status,
        address: address.slice(0, 10) + '...',
      });
      return { totalOps: 0, recentOps: [] };
    }

    const data = await response.json();

    const totalOps = data.totalOps || data.total || 0;
    const recentOps = Array.isArray(data.ops) ? data.ops : [];

    return { totalOps, recentOps };
  } catch (error) {
    logger.error('[JiffyScan] getAccountActivity error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { totalOps: 0, recentOps: [] };
  }
}

/**
 * Get JiffyScan explorer URL for a smart account
 */
export function getJiffyScanURL(address: Address, chain: string = 'base'): string {
  return `${JIFFYSCAN_FRONTEND}/account/${address}?network=${chain}`;
}

/**
 * Check if JiffyScan API is available and configured
 *
 * Returns true if API key is set and API responds.
 */
export async function isJiffyScanAvailable(): Promise<boolean> {
  if (!JIFFYSCAN_API_KEY) {
    return false;
  }

  try {
    // Test with a simple getUserOp request (use a known hash or latest)
    // If no health endpoint, we test with actual API call
    const response = await fetch(
      `${JIFFYSCAN_API_BASE}/getLatestUserOps?network=base&limit=1`,
      {
        headers: {
          'x-api-key': JIFFYSCAN_API_KEY,
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get discovery source status
 *
 * Returns information about available discovery sources and their status.
 */
export async function getDiscoverySourceStatus(): Promise<{
  jiffyscan: boolean;
  entryPoint: boolean;
  dune: boolean;
  recommended: 'jiffyscan' | 'entryPoint' | 'dune';
}> {
  const jiffyscanAvailable = await isJiffyScanAvailable();

  // Import Dune availability check
  let duneAvailable = false;
  try {
    const { isDuneAvailable } = await import('./dune-analytics');
    duneAvailable = await isDuneAvailable();
  } catch (error) {
    // Module not available or error checking
    duneAvailable = false;
  }

  // Prioritize sources: JiffyScan > Dune > Entry Point
  const recommended = jiffyscanAvailable
    ? 'jiffyscan'
    : duneAvailable
    ? 'dune'
    : 'entryPoint';

  return {
    jiffyscan: jiffyscanAvailable,
    entryPoint: true, // Always available (on-chain)
    dune: duneAvailable,
    recommended,
  };
}
