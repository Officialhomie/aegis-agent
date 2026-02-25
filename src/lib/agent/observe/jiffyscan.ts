/**
 * JiffyScan Integration - ERC-4337 UserOp Discovery
 *
 * JiffyScan is the "Etherscan for Smart Accounts" - provides real-time
 * UserOperation data across chains. We use it to discover active smart
 * accounts with proven transaction history.
 *
 * API Endpoints:
 * - /userops - Get recent UserOperations
 * - /bundles - Get bundler activity
 * - /accounts - Get smart account info
 */

import { logger } from '../../logger';
import type { Address } from 'viem';

const JIFFYSCAN_API_BASE = 'https://api.jiffyscan.xyz';
const JIFFYSCAN_FRONTEND = 'https://www.jiffyscan.xyz';

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
    // Note: JiffyScan might not have a public API yet
    // This is a placeholder for when they launch their API
    // For now, we'll use Entry Point events as fallback

    // Attempt to fetch from JiffyScan API (if available)
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
 * Fetch recent UserOperations from JiffyScan
 *
 * Note: This is a placeholder implementation. JiffyScan's public API
 * may not be available yet. In production, we fall back to Entry Point
 * event monitoring.
 */
async function fetchUserOps(
  chain: string,
  limit: number
): Promise<JiffyScanUserOp[]> {
  try {
    // Attempt to fetch from JiffyScan API
    // This endpoint may not exist yet - adjust based on actual API
    const response = await fetch(
      `${JIFFYSCAN_API_BASE}/v1/userops?chain=${chain}&limit=${limit}&sort=recent`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        // API not available yet - this is expected
        logger.debug('[JiffyScan] API endpoint not available (404)', {
          message: 'Use Entry Point monitoring as fallback',
        });
        return [];
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse response based on actual API format
    const userOps: JiffyScanUserOp[] = Array.isArray(data?.userOps) ? data.userOps : [];

    return userOps;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[JiffyScan] Request timeout', { timeout: '10s' });
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error - API might not exist
      logger.debug('[JiffyScan] API not reachable', {
        message: 'This is expected if JiffyScan API is not public yet',
      });
    } else {
      logger.warn('[JiffyScan] Fetch UserOps failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }
}

/**
 * Get JiffyScan explorer URL for a smart account
 */
export function getJiffyScanURL(address: Address, chain: string = 'base'): string {
  return `${JIFFYSCAN_FRONTEND}/account/${address}?network=${chain}`;
}

/**
 * Check if JiffyScan API is available
 *
 * Returns true if the API responds, false otherwise.
 */
export async function isJiffyScanAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${JIFFYSCAN_API_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });

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

  return {
    jiffyscan: jiffyscanAvailable,
    entryPoint: true, // Always available (on-chain)
    dune: false, // Requires API key
    recommended: jiffyscanAvailable ? 'jiffyscan' : 'entryPoint',
  };
}
