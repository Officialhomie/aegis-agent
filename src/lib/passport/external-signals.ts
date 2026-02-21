/**
 * Gas Passport V2 - External Identity Signals
 *
 * Fetches identity signals from external sources:
 * - ENS names (via Alchemy/public resolver)
 * - Farcaster profiles (via Neynar API)
 * - Basenames (via Base resolver)
 * - On-chain activity (via Etherscan/Basescan)
 */

import { logger } from '../logger';
import type { IdentitySignals } from './types';

/**
 * Empty identity signals (default)
 */
export const EMPTY_IDENTITY_SIGNALS: IdentitySignals = {
  ensName: null,
  basename: null,
  farcasterFid: null,
  farcasterFollowers: null,
  onChainTxCount: null,
  isContractDeployer: false,
  accountAgeOnChainDays: null,
};

/**
 * Fetch ENS name for an address (reverse resolution)
 */
export async function fetchEnsName(address: string): Promise<string | null> {
  try {
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    if (!alchemyKey) {
      logger.debug('[Passport] No Alchemy API key configured for ENS lookup');
      return null;
    }

    const response = await fetch(
      `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: '0x3671ae578e63fdf66ad4f3e12cc0c0d71ac7510c', // ENS Reverse Registrar
              data: `0x691f3431${address.toLowerCase().slice(2).padStart(64, '0')}`,
            },
            'latest',
          ],
          id: 1,
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.result && data.result !== '0x') {
      // Decode the name from the response
      // This is simplified - full implementation would decode properly
      return null; // TODO: Implement proper ENS decoding
    }

    return null;
  } catch (error) {
    logger.debug('[Passport] ENS lookup failed', { error, address });
    return null;
  }
}

/**
 * Fetch Farcaster profile via Neynar API
 */
export async function fetchFarcasterProfile(
  address: string
): Promise<{ fid: number; followers: number } | null> {
  try {
    const neynarKey = process.env.NEYNAR_API_KEY;
    if (!neynarKey) {
      logger.debug('[Passport] No Neynar API key configured for Farcaster lookup');
      return null;
    }

    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_verification?address=${address}`,
      {
        headers: {
          accept: 'application/json',
          api_key: neynarKey,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.user && data.user.fid) {
      return {
        fid: data.user.fid,
        followers: data.user.follower_count || 0,
      };
    }

    return null;
  } catch (error) {
    logger.debug('[Passport] Farcaster lookup failed', { error, address });
    return null;
  }
}

/**
 * Fetch Basename for an address (Base L2)
 */
export async function fetchBasename(address: string): Promise<string | null> {
  try {
    // Base uses a similar ENS-style resolver
    // For now, return null as Base name service is still evolving
    // TODO: Implement when Base name service API is stable
    return null;
  } catch (error) {
    logger.debug('[Passport] Basename lookup failed', { error, address });
    return null;
  }
}

/**
 * Fetch on-chain transaction count via Etherscan
 */
export async function fetchOnChainTxCount(
  address: string
): Promise<{ txCount: number; firstTxTimestamp: number | null } | null> {
  try {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    if (!etherscanKey) {
      logger.debug('[Passport] No Etherscan API key configured');
      return null;
    }

    // Get transaction list (limited to first few for performance)
    const response = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${etherscanKey}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status === '1' && data.result && data.result.length > 0) {
      // Get first tx timestamp
      const firstTx = data.result[0];
      const firstTxTimestamp = parseInt(firstTx.timeStamp) * 1000;

      // Get total count via separate call
      const countResponse = await fetch(
        `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=10000&sort=asc&apikey=${etherscanKey}`
      );

      const countData = await countResponse.json();
      const txCount = countData.result ? countData.result.length : 0;

      return { txCount, firstTxTimestamp };
    }

    return { txCount: 0, firstTxTimestamp: null };
  } catch (error) {
    logger.debug('[Passport] Etherscan lookup failed', { error, address });
    return null;
  }
}

/**
 * Check if address has deployed contracts
 */
export async function checkContractDeployer(address: string): Promise<boolean> {
  try {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    if (!etherscanKey) {
      return false;
    }

    // Check for internal transactions that create contracts
    const response = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=asc&apikey=${etherscanKey}`
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    if (data.status === '1' && data.result) {
      // Look for contract creation transactions
      return data.result.some(
        (tx: any) => tx.type === 'create' || tx.contractAddress
      );
    }

    return false;
  } catch (error) {
    logger.debug('[Passport] Contract deployer check failed', { error, address });
    return false;
  }
}

/**
 * Fetch all identity signals for an address
 * Runs lookups in parallel for performance
 */
export async function fetchAllIdentitySignals(
  address: string
): Promise<IdentitySignals> {
  const normalized = address.toLowerCase();

  try {
    // Run all lookups in parallel
    const [ensResult, farcasterResult, basenameResult, onChainResult, isDeployer] =
      await Promise.allSettled([
        fetchEnsName(normalized),
        fetchFarcasterProfile(normalized),
        fetchBasename(normalized),
        fetchOnChainTxCount(normalized),
        checkContractDeployer(normalized),
      ]);

    // Extract results, using null for failures
    const ensName =
      ensResult.status === 'fulfilled' ? ensResult.value : null;
    const farcaster =
      farcasterResult.status === 'fulfilled' ? farcasterResult.value : null;
    const basename =
      basenameResult.status === 'fulfilled' ? basenameResult.value : null;
    const onChain =
      onChainResult.status === 'fulfilled' ? onChainResult.value : null;
    const contractDeployer =
      isDeployer.status === 'fulfilled' ? isDeployer.value : false;

    // Calculate account age in days
    let accountAgeOnChainDays: number | null = null;
    if (onChain?.firstTxTimestamp) {
      const now = Date.now();
      accountAgeOnChainDays = Math.floor(
        (now - onChain.firstTxTimestamp) / (24 * 60 * 60 * 1000)
      );
    }

    return {
      ensName,
      basename,
      farcasterFid: farcaster?.fid ?? null,
      farcasterFollowers: farcaster?.followers ?? null,
      onChainTxCount: onChain?.txCount ?? null,
      isContractDeployer: contractDeployer,
      accountAgeOnChainDays,
    };
  } catch (error) {
    logger.error('[Passport] Failed to fetch identity signals', {
      error,
      address: normalized,
    });
    return EMPTY_IDENTITY_SIGNALS;
  }
}

/**
 * Check if identity signals should be refreshed
 * Returns true if signals are stale (> 24 hours old)
 */
export function shouldRefreshIdentitySignals(
  computedAt: Date,
  currentIdentity: IdentitySignals
): boolean {
  // If no identity data at all, refresh
  if (
    !currentIdentity.ensName &&
    !currentIdentity.farcasterFid &&
    !currentIdentity.onChainTxCount
  ) {
    return true;
  }

  // Refresh if older than 24 hours
  const staleThreshold = 24 * 60 * 60 * 1000;
  const age = Date.now() - computedAt.getTime();

  return age > staleThreshold;
}
