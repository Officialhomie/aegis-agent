/**
 * UserOperation Monitor - Entry Point Event Listener
 *
 * Monitors the ERC-4337 Entry Point contract for UserOperationEvent emissions.
 * When a UserOp from a validated smart account is detected, we can sponsor
 * subsequent operations from that account.
 *
 * Architecture:
 * 1. Listen to EntryPoint.UserOperationEvent
 * 2. Filter by sender (match against validated smart accounts)
 * 3. Track active smart accounts with recent UserOp activity
 * 4. Return candidates for sponsorship targeting
 */

import { createPublicClient, http, type Address, parseAbiItem } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { logger } from '../../logger';

// ERC-4337 Entry Point addresses
const ENTRY_POINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

/**
 * UserOperationEvent ABI
 * Emitted when a UserOperation is executed
 */
const USER_OPERATION_EVENT = parseAbiItem(
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
);

export interface UserOpActivity {
  sender: Address;
  userOpHash: string;
  nonce: bigint;
  success: boolean;
  actualGasCost: bigint;
  actualGasUsed: bigint;
  paymaster: Address | null;
  blockNumber: bigint;
  timestamp: number;
}

export interface UserOpMonitorOptions {
  chainName: 'base' | 'baseSepolia';
  entryPoint?: Address; // Defaults to v0.6
  smartAccounts: Address[]; // Filter to these addresses only
  fromBlock?: bigint; // Start monitoring from this block (default: latest)
  pollInterval?: number; // Poll interval in ms (default: 12000 = 12 sec)
}

/**
 * Monitor Entry Point for UserOperation events from specific smart accounts
 *
 * Returns recent UserOp activity for validated smart accounts.
 * Use this to discover which accounts are actively transacting.
 */
export async function monitorUserOperations(
  options: UserOpMonitorOptions
): Promise<UserOpActivity[]> {
  const {
    chainName,
    entryPoint = ENTRY_POINT_V06 as Address,
    smartAccounts,
    fromBlock,
    pollInterval = 12000,
  } = options;

  if (smartAccounts.length === 0) {
    logger.warn('[UserOpMonitor] No smart accounts provided to monitor');
    return [];
  }

  const chain = chainName === 'base' ? base : baseSepolia;
  const rpcUrl =
    chainName === 'base'
      ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
      : process.env.RPC_URL_BASE_SEPOLIA;

  if (!rpcUrl) {
    logger.error('[UserOpMonitor] RPC URL not configured', { chainName });
    return [];
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 10000 }),
  });

  try {
    const currentBlock = await client.getBlockNumber();
    // Reduce scan range for RPC free tiers (Alchemy free = 10 block limit)
    // Use 100 blocks (~3 minutes on Base) to balance coverage and free tier limits
    const startBlock = fromBlock ?? currentBlock - BigInt(100);

    logger.info('[UserOpMonitor] Scanning Entry Point events', {
      entryPoint: entryPoint.slice(0, 10) + '...',
      fromBlock: startBlock.toString(),
      toBlock: currentBlock.toString(),
      smartAccounts: smartAccounts.length,
      blockRange: (currentBlock - startBlock).toString(),
    });

    // For free tier RPC endpoints, we need to batch requests in small chunks
    const BATCH_SIZE = BigInt(10); // Alchemy free tier limit
    const allLogs: any[] = [];

    for (let batchStart = startBlock; batchStart <= currentBlock; batchStart += BATCH_SIZE) {
      const batchEnd = batchStart + BATCH_SIZE - BigInt(1) > currentBlock
        ? currentBlock
        : batchStart + BATCH_SIZE - BigInt(1);

      try {
        const logs = await client.getLogs({
          address: entryPoint,
          event: USER_OPERATION_EVENT,
          args: {
            sender: smartAccounts.length === 1 ? smartAccounts[0] : undefined,
          },
          fromBlock: batchStart,
          toBlock: batchEnd,
        });

        allLogs.push(...logs);
      } catch (batchError) {
        // Skip failed batches but log the error
        logger.warn('[UserOpMonitor] Batch scan failed', {
          fromBlock: batchStart.toString(),
          toBlock: batchEnd.toString(),
          error: batchError instanceof Error ? batchError.message : String(batchError),
        });
      }
    }

    const logs = allLogs;

    // Filter to only our smart accounts (if multiple)
    const filteredLogs =
      smartAccounts.length > 1
        ? logs.filter((log) => smartAccounts.includes(log.args.sender as Address))
        : logs;

    logger.info('[UserOpMonitor] UserOp events found', {
      total: filteredLogs.length,
      accounts: [...new Set(filteredLogs.map((l) => l.args.sender))].length,
    });

    // Convert logs to UserOpActivity
    const activities: UserOpActivity[] = filteredLogs.map((log) => ({
      sender: log.args.sender as Address,
      userOpHash: log.args.userOpHash as string,
      nonce: log.args.nonce as bigint,
      success: log.args.success as boolean,
      actualGasCost: log.args.actualGasCost as bigint,
      actualGasUsed: log.args.actualGasUsed as bigint,
      paymaster: (log.args.paymaster as Address) || null,
      blockNumber: log.blockNumber,
      timestamp: Date.now(),
    }));

    // Log summary by account
    const byAccount = activities.reduce(
      (acc, a) => {
        const key = a.sender.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    logger.info('[UserOpMonitor] Activity by account', byAccount);

    return activities;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[UserOpMonitor] Failed to monitor UserOps', { error: message });
    return [];
  }
}

/**
 * Get active smart accounts (accounts with recent UserOp activity)
 *
 * Use this to prioritize sponsorship candidates based on recent activity.
 */
export async function getActiveSmartAccounts(
  options: Omit<UserOpMonitorOptions, 'smartAccounts'> & {
    allSmartAccounts: Address[];
    minActivityCount?: number; // Minimum UserOps to be considered "active" (default: 1)
  }
): Promise<{ account: Address; activityCount: number; lastNonce: bigint }[]> {
  const { allSmartAccounts, minActivityCount = 1, ...monitorOptions } = options;

  const activities = await monitorUserOperations({
    ...monitorOptions,
    smartAccounts: allSmartAccounts,
  });

  // Group by account and count activity
  const activityMap = new Map<string, { count: number; lastNonce: bigint }>();

  for (const activity of activities) {
    const key = activity.sender.toLowerCase();
    const existing = activityMap.get(key);

    if (!existing) {
      activityMap.set(key, { count: 1, lastNonce: activity.nonce });
    } else {
      activityMap.set(key, {
        count: existing.count + 1,
        lastNonce: activity.nonce > existing.lastNonce ? activity.nonce : existing.lastNonce,
      });
    }
  }

  // Convert to array and filter by minimum activity
  const activeAccounts = Array.from(activityMap.entries())
    .filter(([_, data]) => data.count >= minActivityCount)
    .map(([address, data]) => ({
      account: address as Address,
      activityCount: data.count,
      lastNonce: data.lastNonce,
    }))
    .sort((a, b) => b.activityCount - a.activityCount); // Sort by activity count (descending)

  logger.info('[UserOpMonitor] Active accounts identified', {
    total: activeAccounts.length,
    minActivityCount,
  });

  return activeAccounts;
}

/**
 * Watch for new UserOperations in real-time
 *
 * Sets up a polling watcher that checks for new UserOps every pollInterval.
 * Calls onUserOp callback when new operations are detected.
 *
 * Returns a cleanup function to stop watching.
 */
export function watchUserOperations(
  options: UserOpMonitorOptions & {
    onUserOp: (activity: UserOpActivity) => void | Promise<void>;
  }
): () => void {
  const { onUserOp, pollInterval = 12000, ...monitorOptions } = options;

  let lastCheckedBlock = BigInt(0);
  let isRunning = true;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const activities = await monitorUserOperations({
        ...monitorOptions,
        fromBlock: lastCheckedBlock > BigInt(0) ? lastCheckedBlock + BigInt(1) : undefined,
      });

      // Update last checked block
      if (activities.length > 0) {
        const maxBlock = activities.reduce(
          (max, a) => (a.blockNumber > max ? a.blockNumber : max),
          BigInt(0)
        );
        lastCheckedBlock = maxBlock;

        // Call callback for each new activity
        for (const activity of activities) {
          await onUserOp(activity);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[UserOpMonitor] Watch poll failed', { error: message });
    }

    // Schedule next poll
    if (isRunning) {
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling
  poll();

  // Return cleanup function
  return () => {
    isRunning = false;
    logger.info('[UserOpMonitor] Stopped watching UserOperations');
  };
}
