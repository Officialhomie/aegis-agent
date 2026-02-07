/**
 * Aegis Agent - Botchan Listener Skill
 *
 * Processes incoming sponsorship requests from other AI agents on Botchan.
 * Validates requests, runs policy checks, and responds with results.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { observeBotchanRequests } from '../observe/botchan';
import { postToFeed } from '../social/botchan';
import { enqueueRequest, getRequestStatus } from '../queue/sponsorship-queue';
import type { Skill, SkillContext, SkillResult } from './index';

/** State key for tracking processed requests */
const PROCESSED_REQUESTS_KEY = 'botchan:processedRequests';

/** Maximum requests to process per execution */
const MAX_REQUESTS_PER_RUN = 5;

/**
 * Sponsorship request format from Botchan
 */
export interface BotchanSponsorshipRequest {
  type: 'SPONSORSHIP_REQUEST';
  requesterAgent: string;
  targetWallet: string;
  protocol: string;
  reason?: string;
  /** Optional request signature for queue consumer to verify */
  signature?: string;
  signatureTimestamp?: number;
}

/**
 * Result of processing a request
 */
interface RequestProcessingResult {
  requestId: string;
  approved: boolean;
  reason: string;
  txHash?: string;
}

/**
 * Parse a Botchan message into a sponsorship request if valid
 */
function parseRequest(message: string, sender: string): BotchanSponsorshipRequest | null {
  const lower = message.toLowerCase();

  // Check for sponsorship request patterns
  if (!lower.includes('sponsor') && !lower.includes('gas')) {
    return null;
  }

  // Try to extract wallet address (0x...)
  const walletMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (!walletMatch) {
    return null;
  }

  // Try to extract protocol name
  const protocolPatterns = [
    /protocol[:\s]+([a-zA-Z0-9-]+)/i,
    /for\s+([a-zA-Z0-9-]+)\s+protocol/i,
    /on\s+([a-zA-Z0-9-]+)/i,
  ];

  let protocol = 'unknown';
  for (const pattern of protocolPatterns) {
    const match = message.match(pattern);
    if (match) {
      protocol = match[1].toLowerCase();
      break;
    }
  }

  return {
    type: 'SPONSORSHIP_REQUEST',
    requesterAgent: sender,
    targetWallet: walletMatch[0],
    protocol,
    reason: message,
  };
}

/**
 * Validate a sponsorship request
 */
async function validateRequest(
  request: BotchanSponsorshipRequest
): Promise<{ valid: boolean; reason: string }> {
  // Check wallet address format
  if (!request.targetWallet.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { valid: false, reason: 'Invalid wallet address format' };
  }

  // Check requester is not empty
  if (!request.requesterAgent || request.requesterAgent === '0x0') {
    return { valid: false, reason: 'Unknown requester agent' };
  }

  // Check protocol is specified
  if (!request.protocol || request.protocol === 'unknown') {
    return { valid: false, reason: 'Protocol not specified' };
  }

  // TODO: Add more validation
  // - Check requester reputation
  // - Check protocol is whitelisted
  // - Check protocol has budget
  // - Check target wallet legitimacy

  return { valid: true, reason: 'Request validated' };
}

/**
 * Process a sponsorship request - adds to the sponsorship queue for async processing.
 */
async function processRequest(
  request: BotchanSponsorshipRequest,
  dryRun: boolean
): Promise<RequestProcessingResult> {
  // Validate the request first
  const validation = await validateRequest(request);
  if (!validation.valid) {
    return {
      requestId: `invalid-${Date.now()}`,
      approved: false,
      reason: validation.reason,
    };
  }

  if (dryRun) {
    return {
      requestId: `dryrun-${Date.now()}`,
      approved: true,
      reason: '[DRY RUN] Would queue sponsorship request',
    };
  }

  try {
    // Add to sponsorship queue for async processing (pass signature fields when present for consumer verification)
    const { requestId, position } = await enqueueRequest({
      protocolId: request.protocol,
      agentAddress: request.targetWallet,
      agentName: request.requesterAgent,
      source: 'botchan',
      estimatedCostUSD: 0.10, // Default estimate, will be calculated during processing
      ...(request.signature != null && { signature: request.signature }),
      ...(request.signatureTimestamp != null && { signatureTimestamp: request.signatureTimestamp }),
    });

    logger.info('[BotchanListener] Request added to queue', {
      requestId,
      position,
      requester: request.requesterAgent,
      wallet: request.targetWallet,
      protocol: request.protocol,
    });

    return {
      requestId,
      approved: true,
      reason: `Request queued (position #${position}). Track status: /api/agent/request-status/${requestId}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[BotchanListener] Failed to queue request', {
      error: message,
      requester: request.requesterAgent,
      wallet: request.targetWallet,
    });

    return {
      requestId: `error-${Date.now()}`,
      approved: false,
      reason: `Failed to queue request: ${message}`,
    };
  }
}

/**
 * Send response to Botchan feed
 */
async function sendResponse(
  request: BotchanSponsorshipRequest,
  result: RequestProcessingResult
): Promise<void> {
  const status = result.approved ? 'APPROVED' : 'REJECTED';
  const txInfo = result.txHash ? `\nTx: https://basescan.org/tx/${result.txHash}` : '';

  const message = [
    `Sponsorship ${status}`,
    `Wallet: ${request.targetWallet.slice(0, 10)}...`,
    `Protocol: ${request.protocol}`,
    `Reason: ${result.reason}`,
    txInfo,
    '#AegisPaymaster #BotchanRequest',
  ]
    .filter(Boolean)
    .join('\n');

  const feed = process.env.BOTCHAN_FEED_OUTBOUND?.trim() ?? 'aegis-responses';
  await postToFeed(feed, message);
}

/**
 * Get set of already-processed request IDs
 */
async function getProcessedRequests(): Promise<Set<string>> {
  const store = await getStateStore();
  const data = await store.get(PROCESSED_REQUESTS_KEY);
  if (!data) return new Set();

  try {
    const ids = JSON.parse(data) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Mark a request as processed
 */
async function markRequestProcessed(requestId: string): Promise<void> {
  const store = await getStateStore();
  const existing = await getProcessedRequests();
  existing.add(requestId);

  // Keep only last 500 request IDs
  const ids = Array.from(existing).slice(-500);
  await store.set(PROCESSED_REQUESTS_KEY, JSON.stringify(ids));
}

/**
 * Execute the Botchan Listener skill
 */
async function execute(context: SkillContext): Promise<SkillResult> {
  const dryRun = context.dryRun ?? false;

  try {
    // Get inbound requests from Botchan
    const observations = await observeBotchanRequests();

    if (observations.length === 0) {
      return {
        success: true,
        summary: 'No Botchan requests found',
        data: { requestsFound: 0, processed: 0, approved: 0, rejected: 0 },
      };
    }

    const processedRequests = await getProcessedRequests();
    const results: RequestProcessingResult[] = [];

    let processed = 0;
    let approved = 0;
    let rejected = 0;

    for (const obs of observations.slice(0, MAX_REQUESTS_PER_RUN)) {
      const data = obs.data as { message?: string; wallet?: string };
      const message = data.message ?? '';
      const sender = data.wallet ?? '0x0';

      // Generate unique ID for this observation
      const obsId = obs.id;
      if (processedRequests.has(obsId)) {
        continue;
      }

      // Try to parse as sponsorship request
      const request = parseRequest(message, sender);
      if (!request) {
        await markRequestProcessed(obsId);
        continue;
      }

      // Pass through signature fields from observation data when present (e.g. from API or JSON message)
      const sig = (data as { signature?: string; signatureTimestamp?: number }).signature;
      const sigTs = (data as { signatureTimestamp?: number }).signatureTimestamp;
      if (sig != null) request.signature = sig;
      if (sigTs != null) request.signatureTimestamp = sigTs;

      // Process the request
      const result = await processRequest(request, dryRun);
      results.push(result);
      processed++;

      if (result.approved) {
        approved++;
      } else {
        rejected++;
      }

      // Send response (unless dry run)
      if (!dryRun) {
        try {
          await sendResponse(request, result);
        } catch (error) {
          logger.warn('[BotchanListener] Failed to send response', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await markRequestProcessed(obsId);
    }

    return {
      success: true,
      summary: `Processed ${processed} requests: ${approved} approved, ${rejected} rejected`,
      data: {
        requestsFound: observations.length,
        processed,
        approved,
        rejected,
        dryRun,
        results,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Botchan Listener Skill Definition
 */
export const botchanListenerSkill: Skill = {
  name: 'botchan-listener',
  description: 'Process incoming sponsorship requests from other AI agents on Botchan',
  trigger: 'schedule',
  interval: 60 * 1000, // Run every minute (aligned with sponsorship cycle)
  enabled: true,
  execute,
};
