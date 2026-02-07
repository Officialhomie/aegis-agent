/**
 * Aegis Agent - Queue Consumer
 *
 * Drains the sponsorship request queue: dequeue → optional signature verify →
 * policy validate → sponsorTransaction → completeRequest / failRequest / rejectRequest.
 * Call recoverStaleRequests() once per run. Cap items per run to avoid blocking.
 */

import { logger } from '../../logger';
import {
  dequeueRequest,
  completeRequest,
  failRequest,
  rejectRequest,
  recoverStaleRequests,
  type SponsorshipRequest,
} from './sponsorship-queue';
import { verifySimpleSignature } from '../verify/request-signature';
import { validatePolicy } from '../policy';
import { sponsorTransaction } from '../execute';
import { getAdaptiveGasSponsorshipConfig } from '../modes/gas-sponsorship';
import { observeGasPrice } from '../observe';
import type { Decision } from '../reason/schemas';
import type { AgentConfig } from '../index';

const MAX_ITEMS_PER_RUN = 5;

/**
 * Build a SPONSOR_TRANSACTION decision from a queue request.
 */
function requestToDecision(request: SponsorshipRequest): Decision {
  return {
    action: 'SPONSOR_TRANSACTION',
    parameters: {
      agentWallet: request.agentAddress,
      protocolId: request.protocolId,
      estimatedCostUSD: request.estimatedCostUSD ?? 0,
      maxGasLimit: request.maxGasLimit ?? 200_000,
      targetContract: request.targetContract,
    },
    confidence: 1,
    reasoning: `Queue sponsorship: ${request.id}`,
  };
}

/**
 * Get config for policy and execution (gas-sponsorship style with current gas price).
 */
async function getQueueConsumerConfig(): Promise<AgentConfig> {
  const config = await getAdaptiveGasSponsorshipConfig();
  const gasObs = await observeGasPrice();
  const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
  const currentGasPriceGwei =
    gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;
  return { ...config, currentGasPriceGwei };
}

/**
 * Process a single dequeued request: verify signature (if present), validate policy, execute, update status.
 */
async function processOneRequest(request: SponsorshipRequest): Promise<void> {
  const { id: requestId } = request;

  if (request.signature != null && request.signatureTimestamp != null) {
    const result = verifySimpleSignature({
      agentAddress: request.agentAddress,
      protocolId: request.protocolId,
      timestamp: request.signatureTimestamp,
      signature: request.signature,
    });
    if (!result.valid) {
      await rejectRequest(requestId, result.error ?? 'Invalid signature');
      logger.warn('[QueueConsumer] Signature verification failed', { requestId, error: result.error });
      return;
    }
  }

  const decision = requestToDecision(request);
  const config = await getQueueConsumerConfig();

  const policyResult = await validatePolicy(decision, config);
  if (!policyResult.passed) {
    const reason = policyResult.errors?.join('; ') ?? 'Policy rejected';
    await rejectRequest(requestId, reason);
    logger.warn('[QueueConsumer] Policy rejected', { requestId, errors: policyResult.errors });
    return;
  }

  const mode = config.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION';
  const result = await sponsorTransaction(decision, mode);

  if (result.success) {
    const txHash =
      (result as { transactionHash?: string }).transactionHash ??
      (result as { sponsorshipHash?: string }).sponsorshipHash;
    const userOpHash = (result as { sponsorshipHash?: string }).sponsorshipHash;
    const actualCostUSD =
      (result as { actualCostUSD?: number }).actualCostUSD ?? request.estimatedCostUSD;
    await completeRequest(requestId, {
      txHash,
      userOpHash,
      actualCostUSD,
    });
    logger.info('[QueueConsumer] Request completed', { requestId, txHash: txHash?.slice(0, 18) });
  } else {
    const error = result.error ?? 'Sponsorship failed';
    await failRequest(requestId, error, true);
    logger.warn('[QueueConsumer] Sponsorship failed', { requestId, error });
  }
}

/**
 * Drain up to MAX_ITEMS_PER_RUN items from the queue, then run recovery.
 * Safe to call on an interval (e.g. every 30s).
 */
export async function processQueue(): Promise<void> {
  let processed = 0;

  while (processed < MAX_ITEMS_PER_RUN) {
    const request = await dequeueRequest();
    if (!request) break;

    try {
      await processOneRequest(request);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await failRequest(request.id, error, true).catch((e) =>
        logger.error('[QueueConsumer] failRequest error', { requestId: request.id, error: e })
      );
      logger.error('[QueueConsumer] Process error', { requestId: request.id, error: err });
    }
    processed++;
  }

  const recovered = await recoverStaleRequests();
  if (recovered > 0) {
    logger.info('[QueueConsumer] Recovered stale requests', { count: recovered });
  }
}
