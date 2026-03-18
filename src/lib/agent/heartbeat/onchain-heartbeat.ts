/**
 * Onchain Heartbeat Runner
 *
 * Posts periodic liveness proofs to AegisAttestationLogger on Base.
 * Runs every ONCHAIN_HEARTBEAT_INTERVAL_MS (default: 15 minutes).
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { postOnchainHeartbeat } from '../execute/attestation-logger';
import { logger } from '../../logger';
import { getPrisma } from '../../db';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function getChain() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_BASE_SEPOLIA ??
    'https://sepolia.base.org'
  );
}

/**
 * Execute a single onchain heartbeat.
 */
export async function executeOnchainHeartbeat(): Promise<{ success: boolean; txHash?: string }> {
  try {
    const chain = getChain();
    const rpcUrl = getRpcUrl();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    const gasPrice = await publicClient.getGasPrice();

    let activeProtocols = 0;
    try {
      const prisma = getPrisma();
      activeProtocols = await prisma.protocolSponsor.count({
        where: { onboardingStatus: { in: ['LIVE', 'APPROVED_SIMULATION'] } },
      });
    } catch {
      activeProtocols = 0;
    }

    const result = await postOnchainHeartbeat({
      gasPriceWei: gasPrice,
      activeProtocols,
    });

    if (result.success && result.txHash) {
      logger.info('[OnchainHeartbeat] Posted liveness proof', {
        txHash: result.txHash,
        gasPrice: gasPrice.toString(),
        activeProtocols,
      });
    }

    return { success: result.success, txHash: result.txHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[OnchainHeartbeat] Failed', { error: message });
    return { success: false };
  }
}

/**
 * Start periodic onchain heartbeat.
 * Returns a cleanup function to stop the interval.
 */
export function startOnchainHeartbeat(
  intervalMs: number = Number(process.env.ONCHAIN_HEARTBEAT_INTERVAL_MS) || DEFAULT_INTERVAL_MS
): () => void {
  if (!process.env.ATTESTATION_LOGGER_ADDRESS) {
    logger.info('[OnchainHeartbeat] ATTESTATION_LOGGER_ADDRESS not set - skipping onchain heartbeat');
    return () => {};
  }

  logger.info('[OnchainHeartbeat] Starting periodic onchain heartbeat', {
    intervalMs,
    intervalMinutes: Math.round(intervalMs / 60000),
  });

  // Post initial heartbeat
  executeOnchainHeartbeat().catch(() => {});

  const timer = setInterval(() => {
    executeOnchainHeartbeat().catch(() => {});
  }, intervalMs);

  return () => {
    clearInterval(timer);
    logger.info('[OnchainHeartbeat] Stopped');
  };
}
