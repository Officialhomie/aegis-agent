/**
 * Dune Analytics Integration - Historical ERC-4337 Data
 *
 * Dune Analytics provides SQL-queryable blockchain data with comprehensive
 * ERC-4337 coverage. We use it to analyze historical UserOperation patterns
 * and identify consistently active smart accounts.
 *
 * Real API Documentation:
 * - Docs: https://docs.dune.com/api-reference/overview/introduction
 * - Authentication: https://docs.dune.com/api-reference/overview/authentication
 * - API Key: https://dune.com/settings/api
 * - Execute Query: https://docs.dune.com/api-reference/executions/endpoint/execute-query
 *
 * Key Tables:
 * - account_abstraction_erc4337.userops - Multi-chain UserOp data with bundler info
 * - erc4337_{chain}.user_ops - Chain-specific tables (if available)
 *
 * Workflow:
 * 1. Execute query with parameters (POST /query/{query_id}/execute)
 * 2. Get execution_id from response
 * 3. Poll for results (GET /execution/{execution_id}/results)
 * 4. Parse and return data
 */

import { logger } from '../../logger';
import type { Address } from 'viem';

const DUNE_API_BASE = 'https://api.dune.com/api/v1';
const DUNE_API_KEY = process.env.DUNE_API_KEY;

// Default Dune query IDs (users can override with custom queries)
// These would be pre-created queries on Dune for ERC-4337 analysis
const DEFAULT_QUERY_IDS = {
  activeAccountsBase: 3484910, // Example query ID - replace with actual Base AA query
  topAccountsByVolume: 3484911, // Example query ID
  recentUserOps: 3484912, // Example query ID
};

export interface DuneUserOp {
  sender: Address;
  userOpHash: string;
  blockNumber: number;
  blockTime: number;
  success: boolean;
  actualGasCost: string;
  actualGasUsed: string;
  paymaster?: Address;
  bundler?: Address;
  transactionHash: string;
  chainId: number;
}

export interface DuneSmartAccount {
  address: Address;
  totalOps: number;
  successfulOps: number;
  failedOps: number;
  totalGasSpent: string;
  firstSeen: number;
  lastSeen: number;
  avgGasPerOp: string;
  chainId: number;
}

export interface DuneQueryParams {
  chain?: 'base' | 'ethereum' | 'optimism' | 'arbitrum' | 'polygon';
  chainId?: number;
  days?: number; // Last N days of data
  minOps?: number; // Minimum UserOps to be considered active
  limit?: number; // Max results
}

export interface DuneExecutionResponse {
  execution_id: string;
  state: 'QUERY_STATE_PENDING' | 'QUERY_STATE_EXECUTING' | 'QUERY_STATE_COMPLETED' | 'QUERY_STATE_FAILED';
}

export interface DuneResultsResponse {
  execution_id: string;
  query_id: number;
  state: string;
  submitted_at: string;
  expires_at: string;
  execution_started_at?: string;
  execution_ended_at?: string;
  result?: {
    rows: any[];
    metadata: {
      column_names: string[];
      column_types: string[];
      row_count: number;
      result_set_bytes: number;
      total_row_count: number;
      total_result_set_bytes: number;
      datapoint_count: number;
      pending_time_millis: number;
      execution_time_millis: number;
    };
  };
}

/**
 * Discover active smart accounts from Dune Analytics
 *
 * Executes a Dune query to find smart accounts with historical UserOp activity,
 * sorted by activity volume and recency.
 */
export async function discoverFromDune(
  params: DuneQueryParams
): Promise<{
  accounts: DuneSmartAccount[];
  userOps: DuneUserOp[];
  source: string;
}> {
  const { chain = 'base', days = 7, minOps = 1, limit = 100 } = params;

  logger.info('[Dune] Discovering active smart accounts', {
    chain,
    days,
    minOps,
    limit,
  });

  if (!DUNE_API_KEY) {
    logger.warn('[Dune] No API key configured', {
      message: 'Set DUNE_API_KEY in .env. Get key from https://dune.com/settings/api',
      fallback: 'Using other discovery sources instead',
    });
    return {
      accounts: [],
      userOps: [],
      source: 'dune-unavailable',
    };
  }

  try {
    // Map chain names to chain IDs
    const chainIdMap: Record<string, number> = {
      base: 8453,
      ethereum: 1,
      optimism: 10,
      arbitrum: 42161,
      polygon: 137,
    };

    const chainId = chainIdMap[chain] || 8453;

    // Execute Dune query with parameters
    const accounts = await queryActiveAccounts({
      chainId,
      days,
      minOps,
      limit,
    });

    if (accounts.length === 0) {
      logger.warn('[Dune] No active accounts found', {
        chain,
        days,
        suggestion: 'Try increasing days parameter or lowering minOps threshold',
      });
      return {
        accounts: [],
        userOps: [],
        source: 'dune-no-results',
      };
    }

    logger.info('[Dune] Discovery complete', {
      totalAccounts: accounts.length,
      topAccount: accounts[0]
        ? {
            address: accounts[0].address.slice(0, 10) + '...',
            ops: accounts[0].totalOps,
          }
        : null,
    });

    return {
      accounts,
      userOps: [], // UserOps are aggregated in accounts for Dune queries
      source: 'dune',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[Dune] Discovery failed', { error: message });

    return {
      accounts: [],
      userOps: [],
      source: 'dune-error',
    };
  }
}

/**
 * Query active smart accounts from Dune Analytics
 *
 * Uses the account_abstraction_erc4337.userops table to aggregate
 * smart account activity over the specified time period.
 */
async function queryActiveAccounts(
  params: Required<Pick<DuneQueryParams, 'chainId' | 'days' | 'minOps' | 'limit'>>
): Promise<DuneSmartAccount[]> {
  const { chainId, days, minOps, limit } = params;

  // SQL query to find active smart accounts
  // This would be pre-created on Dune and referenced by query_id
  // For now, we'll use the execute query endpoint with parameters
  const queryId = DEFAULT_QUERY_IDS.activeAccountsBase;

  // Execute the query with parameters
  const executionId = await executeQuery(queryId, {
    chain_id: chainId,
    days: days,
    min_ops: minOps,
    result_limit: limit,
  });

  // Poll for results
  const results = await pollQueryResults(executionId);

  // Parse results into DuneSmartAccount format
  const accounts: DuneSmartAccount[] = results.map((row: any) => ({
    address: row.sender || row.smart_account || row.address,
    totalOps: parseInt(row.total_ops || row.userop_count || '0', 10),
    successfulOps: parseInt(row.successful_ops || '0', 10),
    failedOps: parseInt(row.failed_ops || '0', 10),
    totalGasSpent: row.total_gas_spent || row.total_gas_cost || '0',
    firstSeen: row.first_seen_timestamp
      ? new Date(row.first_seen_timestamp).getTime() / 1000
      : 0,
    lastSeen: row.last_seen_timestamp
      ? new Date(row.last_seen_timestamp).getTime() / 1000
      : Date.now() / 1000,
    avgGasPerOp: row.avg_gas_per_op || '0',
    chainId: chainId,
  }));

  return accounts;
}

/**
 * Execute a Dune query with parameters
 *
 * POSTs to /query/{query_id}/execute and returns the execution_id
 * for polling results.
 */
async function executeQuery(
  queryId: number,
  params: Record<string, any>
): Promise<string> {
  const url = `${DUNE_API_BASE}/query/${queryId}/execute`;

  logger.debug('[Dune] Executing query', { queryId, params });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Dune-API-Key': DUNE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_parameters: params,
      performance: 'medium', // 'medium' or 'large' for faster execution
    }),
    signal: AbortSignal.timeout(30000), // 30 second timeout for execution request
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Dune API authentication failed. Check DUNE_API_KEY is valid.'
      );
    }

    if (response.status === 404) {
      throw new Error(
        `Dune query ${queryId} not found. Create query on Dune first.`
      );
    }

    if (response.status === 429) {
      throw new Error(
        'Dune API rate limit exceeded. Upgrade plan or wait before retrying.'
      );
    }

    const errorText = await response.text();
    throw new Error(`Dune API error ${response.status}: ${errorText}`);
  }

  const data: DuneExecutionResponse = await response.json();

  if (!data.execution_id) {
    throw new Error('No execution_id returned from Dune API');
  }

  logger.info('[Dune] Query execution started', {
    executionId: data.execution_id,
    state: data.state,
  });

  return data.execution_id;
}

/**
 * Poll for Dune query results
 *
 * Polls the /execution/{execution_id}/results endpoint until
 * the query completes (QUERY_STATE_COMPLETED) or fails.
 */
async function pollQueryResults(
  executionId: string,
  maxAttempts: number = 60,
  pollInterval: number = 2000
): Promise<any[]> {
  const url = `${DUNE_API_BASE}/execution/${executionId}/results`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.debug('[Dune] Polling for results', {
      executionId,
      attempt,
      maxAttempts,
    });

    const response = await fetch(url, {
      headers: {
        'X-Dune-API-Key': DUNE_API_KEY!,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout per poll
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Dune API authentication failed during polling');
      }

      throw new Error(`Dune API polling error ${response.status}`);
    }

    const data: DuneResultsResponse = await response.json();

    if (data.state === 'QUERY_STATE_COMPLETED') {
      if (!data.result || !data.result.rows) {
        logger.warn('[Dune] Query completed but no results', { executionId });
        return [];
      }

      logger.info('[Dune] Query completed successfully', {
        executionId,
        rowCount: data.result.metadata.row_count,
        executionTime: data.result.metadata.execution_time_millis,
      });

      return data.result.rows;
    }

    if (data.state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${executionId}`);
    }

    // Query still executing, wait before next poll
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Dune query timeout after ${maxAttempts} attempts: ${executionId}`
  );
}

/**
 * Get recent UserOperations from Dune Analytics
 *
 * Queries for individual UserOps rather than aggregated account data.
 * Useful for understanding transaction patterns and timing.
 */
export async function getRecentUserOps(
  params: DuneQueryParams
): Promise<DuneUserOp[]> {
  const { chain = 'base', days = 7, limit = 1000 } = params;

  if (!DUNE_API_KEY) {
    logger.warn('[Dune] No API key for getRecentUserOps');
    return [];
  }

  try {
    const chainIdMap: Record<string, number> = {
      base: 8453,
      ethereum: 1,
      optimism: 10,
      arbitrum: 42161,
      polygon: 137,
    };

    const chainId = chainIdMap[chain] || 8453;
    const queryId = DEFAULT_QUERY_IDS.recentUserOps;

    const executionId = await executeQuery(queryId, {
      chain_id: chainId,
      days: days,
      result_limit: limit,
    });

    const results = await pollQueryResults(executionId);

    const userOps: DuneUserOp[] = results.map((row: any) => ({
      sender: row.sender,
      userOpHash: row.userop_hash || row.user_op_hash,
      blockNumber: parseInt(row.block_number || '0', 10),
      blockTime: row.block_time
        ? new Date(row.block_time).getTime() / 1000
        : 0,
      success: row.success !== false && row.success !== 'false',
      actualGasCost: row.actual_gas_cost || row.gas_cost || '0',
      actualGasUsed: row.actual_gas_used || row.gas_used || '0',
      paymaster: row.paymaster || undefined,
      bundler: row.bundler || undefined,
      transactionHash: row.transaction_hash || row.tx_hash || '',
      chainId: chainId,
    }));

    return userOps;
  } catch (error) {
    logger.error('[Dune] getRecentUserOps failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Check if Dune API is available and configured
 *
 * Returns true if API key is set. Does not execute a query
 * to avoid consuming query credits for health checks.
 */
export async function isDuneAvailable(): Promise<boolean> {
  return !!DUNE_API_KEY;
}

/**
 * Get Dune dashboard URL for ERC-4337 analytics
 */
export function getDuneDashboardURL(chain: string = 'base'): string {
  // Link to pre-built Dune dashboards for ERC-4337
  return 'https://dune.com/niftytable/account-abstraction';
}

/**
 * Example SQL query for reference (would be created on Dune)
 *
 * This query finds the most active smart accounts on Base in the last 7 days.
 * Users should create this query on Dune and use its query_id.
 */
export const EXAMPLE_ACTIVE_ACCOUNTS_SQL = `
-- Top 100 Active Smart Accounts on Base (Last 7 Days)
-- Query Parameters: {{chain_id}}, {{days}}, {{min_ops}}, {{result_limit}}

SELECT
  sender as smart_account,
  COUNT(*) as total_ops,
  COUNT(CASE WHEN success = true THEN 1 END) as successful_ops,
  COUNT(CASE WHEN success = false THEN 1 END) as failed_ops,
  SUM(CAST(actual_gas_cost AS DOUBLE)) as total_gas_spent,
  MIN(block_time) as first_seen_timestamp,
  MAX(block_time) as last_seen_timestamp,
  AVG(CAST(actual_gas_used AS DOUBLE)) as avg_gas_per_op
FROM account_abstraction_erc4337.userops
WHERE
  blockchain = 'base'
  AND chain_id = {{chain_id}}
  AND block_time > NOW() - INTERVAL '{{days}}' DAY
GROUP BY sender
HAVING COUNT(*) >= {{min_ops}}
ORDER BY total_ops DESC
LIMIT {{result_limit}}
`;
