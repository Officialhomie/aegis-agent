/**
 * Aegis Paymaster PostOp Event Listener
 *
 * Listens for UserOpSponsored events emitted by AegisPaymaster.sol after each
 * UserOp is processed. On each event, reconciles the AgentSpendLedger:
 * - Finds the matching RESERVED entry by userOpHash
 * - Updates actualUSD with the real gas cost from the event
 * - Marks it COMMITTED
 *
 * Falls back to creating a COMMITTED entry directly if no matching reservation
 * is found (e.g., if the service restarted between reservation and postOp).
 */

import { createPublicClient, http, type Address, type Hex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { logger } from '../../logger';
import { commitReservation } from './agent-budget-service';

const PAYMASTER_ABI = [
  {
    type: 'event',
    name: 'UserOpSponsored',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'userOpHash', type: 'bytes32', indexed: true },
      { name: 'agentTier', type: 'uint8', indexed: false },
      { name: 'actualGasCost', type: 'uint256', indexed: false },
    ],
  },
] as const;

let stopWatcher: (() => void) | null = null;

/**
 * Start listening for UserOpSponsored events from AegisPaymaster.
 * Call once on agent startup when AEGIS_PAYMASTER_ADDRESS is configured.
 */
export async function startPostOpEventListener(): Promise<void> {
  const paymasterAddress = process.env.AEGIS_PAYMASTER_ADDRESS?.trim() as Address | undefined;
  if (!paymasterAddress) {
    logger.debug('[PostOpListener] AEGIS_PAYMASTER_ADDRESS not set — skipping event listener');
    return;
  }

  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const chain = networkId === 'base' ? base : baseSepolia;
  const rpcUrl = networkId === 'base'
    ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
    : process.env.RPC_URL_BASE_SEPOLIA;

  if (!rpcUrl) {
    logger.warn('[PostOpListener] RPC URL not configured — cannot watch postOp events');
    return;
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  logger.info('[PostOpListener] Starting UserOpSponsored event watcher', {
    paymasterAddress,
    chain: chain.name,
  });

  const unwatch = client.watchContractEvent({
    address: paymasterAddress,
    abi: PAYMASTER_ABI,
    eventName: 'UserOpSponsored',
    onLogs: async (logs) => {
      for (const log of logs) {
        await handlePostOpEvent({
          sender: log.args.sender as Address,
          userOpHash: log.args.userOpHash as Hex,
          agentTier: Number(log.args.agentTier),
          actualGasCost: log.args.actualGasCost as bigint,
          transactionHash: log.transactionHash as Hex,
        });
      }
    },
    onError: (error) => {
      logger.error('[PostOpListener] Event watcher error', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  stopWatcher = unwatch;
}

/**
 * Stop the event listener. Call on graceful shutdown.
 */
export function stopPostOpEventListener(): void {
  if (stopWatcher) {
    stopWatcher();
    stopWatcher = null;
    logger.info('[PostOpListener] UserOpSponsored event watcher stopped');
  }
}

export interface PostOpEvent {
  sender: Address;
  userOpHash: Hex;
  agentTier: number;
  actualGasCost: bigint;
  transactionHash: Hex;
}

/**
 * Handle a single UserOpSponsored event.
 * Exported for testing.
 */
export async function handlePostOpEvent(event: PostOpEvent): Promise<void> {
  const { getPrisma } = await import('../../db');
  const db = getPrisma();

  // Convert actualGasCost (wei) to USD
  // Approximate: gas cost in ETH * ETH price in USD
  // For accounting accuracy, use the ETH price at time of execution.
  // Fallback: store as 0 and update later via reconciliation job.
  const actualCostUSD = await estimateWeiToUSD(event.actualGasCost);

  logger.debug('[PostOpListener] Processing UserOpSponsored event', {
    sender: event.sender.slice(0, 12),
    userOpHash: event.userOpHash.slice(0, 14),
    actualGasCost: event.actualGasCost.toString(),
    actualCostUSD,
  });

  // Find the matching RESERVED entry
  const reservation = await db.agentSpendLedger.findFirst({
    where: { userOpHash: event.userOpHash, status: 'RESERVED' },
    select: { reservationId: true },
  });

  if (reservation) {
    await commitReservation(reservation.reservationId, {
      amountUSD: actualCostUSD,
      userOpHash: event.userOpHash,
      txHash: event.transactionHash,
    });
    logger.info('[PostOpListener] Committed reservation via postOp event', {
      reservationId: reservation.reservationId,
      actualCostUSD,
    });
  } else {
    // No matching reservation — create a COMMITTED entry directly (edge case)
    logger.warn('[PostOpListener] No matching RESERVED entry for userOpHash — creating direct COMMITTED record', {
      userOpHash: event.userOpHash,
    });
    await db.agentSpendLedger.create({
      data: {
        protocolId: 'unknown', // Will be reconciled
        agentAddress: event.sender.toLowerCase(),
        date: new Date().toISOString().slice(0, 10),
        estimatedUSD: actualCostUSD,
        actualUSD: actualCostUSD,
        status: 'COMMITTED',
        userOpHash: event.userOpHash,
        txHash: event.transactionHash,
        reservationId: `postop-${event.userOpHash.slice(2, 18)}`,
        agentTier: event.agentTier,
        committedAt: new Date(),
      },
    });
  }
}

/**
 * Rough ETH-to-USD conversion for gas cost accounting.
 * Uses USDC/ETH oracle price or falls back to a conservative estimate.
 */
async function estimateWeiToUSD(wei: bigint): Promise<number> {
  try {
    const { getEthPriceUSD } = await import('../observe/oracles');
    const ethPriceUSD = await getEthPriceUSD();
    const ethAmount = Number(wei) / 1e18;
    return ethAmount * ethPriceUSD;
  } catch {
    // Fallback: assume ETH = $3000 (conservative)
    const ethAmount = Number(wei) / 1e18;
    return ethAmount * 3000;
  }
}
