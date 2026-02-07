/**
 * Aegis Agent - Sponsorship Request Queue
 *
 * Queue for sponsorship requests with status tracking.
 * Uses StateStore (Redis or in-memory) for persistence.
 * Implements list operations using JSON arrays.
 */

import { getStateStore, type StateStore } from '../state-store';
import { logger } from '../../logger';
import { randomUUID } from 'crypto';

/**
 * Sponsorship request status.
 */
export type RequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

/**
 * Sponsorship request data.
 */
export interface SponsorshipRequest {
  id: string;
  protocolId: string;
  agentAddress: string;
  agentName?: string;
  targetContract?: string;
  callData?: string;
  estimatedGas?: number;
  estimatedCostUSD?: number;
  maxGasLimit?: number;

  // Request metadata
  source: 'botchan' | 'api' | 'webhook' | 'manual';
  requestedAt: number;
  signature?: string;
  signatureTimestamp?: number;

  // Status tracking
  status: RequestStatus;
  processingStartedAt?: number;
  completedAt?: number;
  failedAt?: number;

  // Result
  txHash?: string;
  userOpHash?: string;
  actualCostUSD?: number;
  error?: string;

  // Metadata
  retryCount: number;
  maxRetries: number;
}

/**
 * Queue list structure stored in StateStore.
 */
interface QueueList {
  items: string[];
  updatedAt: number;
}

/**
 * Queue configuration.
 */
const QUEUE_KEY_PREFIX = 'aegis:queue:sponsorship';
const REQUEST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 3;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_COMPLETED_ITEMS = 1000;
const MAX_FAILED_ITEMS = 1000;
const LOCK_TIMEOUT_MS = 5000;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Get all queue keys.
 */
function getQueueKeys() {
  return {
    pending: `${QUEUE_KEY_PREFIX}:pending`,
    processing: `${QUEUE_KEY_PREFIX}:processing`,
    completed: `${QUEUE_KEY_PREFIX}:completed`,
    failed: `${QUEUE_KEY_PREFIX}:failed`,
    request: (id: string) => `${QUEUE_KEY_PREFIX}:request:${id}`,
    lock: `${QUEUE_KEY_PREFIX}:lock`,
  };
}

/**
 * Get a queue list from store.
 */
async function getQueueList(store: StateStore, key: string): Promise<QueueList> {
  const data = await store.get(key);
  if (!data) {
    return { items: [], updatedAt: Date.now() };
  }
  try {
    return JSON.parse(data) as QueueList;
  } catch {
    return { items: [], updatedAt: Date.now() };
  }
}

/**
 * Save a queue list to store.
 */
async function saveQueueList(store: StateStore, key: string, list: QueueList): Promise<void> {
  await store.set(key, JSON.stringify(list), { px: REQUEST_TTL_MS });
}

/**
 * Acquire a simple lock for queue operations.
 */
async function acquireLock(store: StateStore): Promise<boolean> {
  const keys = getQueueKeys();
  return store.setNX(keys.lock, Date.now().toString(), { px: LOCK_TIMEOUT_MS });
}

/**
 * Add a new sponsorship request to the queue.
 */
export async function enqueueRequest(
  request: Omit<SponsorshipRequest, 'id' | 'status' | 'requestedAt' | 'retryCount' | 'maxRetries'>
): Promise<{ requestId: string; position: number }> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const requestId = generateRequestId();
  const fullRequest: SponsorshipRequest = {
    ...request,
    id: requestId,
    status: 'pending',
    requestedAt: Date.now(),
    retryCount: 0,
    maxRetries: MAX_RETRIES,
  };

  // Acquire lock for queue modification
  let locked = await acquireLock(store);
  if (!locked) {
    // Retry once after short delay
    await new Promise((r) => setTimeout(r, 100));
    locked = await acquireLock(store);
    if (!locked) {
      throw new Error('Failed to acquire queue lock');
    }
  }

  // Store the request data
  await store.set(
    keys.request(requestId),
    JSON.stringify(fullRequest),
    { px: REQUEST_TTL_MS }
  );

  // Add to pending list
  const pending = await getQueueList(store, keys.pending);
  pending.items.push(requestId);
  pending.updatedAt = Date.now();
  await saveQueueList(store, keys.pending, pending);

  const position = pending.items.length;

  logger.info('[Queue] Request enqueued', {
    requestId,
    protocolId: request.protocolId,
    agentAddress: request.agentAddress.slice(0, 10) + '...',
    source: request.source,
    position,
  });

  return { requestId, position };
}

/**
 * Get the next pending request for processing.
 * Moves the request from pending to processing state.
 */
export async function dequeueRequest(): Promise<SponsorshipRequest | null> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const locked = await acquireLock(store);
  if (!locked) {
    return null; // Another worker is processing
  }

  // Get pending list
  const pending = await getQueueList(store, keys.pending);
  if (pending.items.length === 0) {
    return null;
  }

  // Pop first item (FIFO)
  const requestId = pending.items.shift()!;
  pending.updatedAt = Date.now();
  await saveQueueList(store, keys.pending, pending);

  // Get request data
  const requestData = await store.get(keys.request(requestId));
  if (!requestData) {
    logger.warn('[Queue] Request data not found', { requestId });
    return null;
  }

  try {
    const request = JSON.parse(requestData) as SponsorshipRequest;

    // Update status to processing
    const updatedRequest: SponsorshipRequest = {
      ...request,
      status: 'processing',
      processingStartedAt: Date.now(),
    };

    await store.set(
      keys.request(requestId),
      JSON.stringify(updatedRequest),
      { px: REQUEST_TTL_MS }
    );

    // Add to processing list
    const processing = await getQueueList(store, keys.processing);
    processing.items.push(requestId);
    processing.updatedAt = Date.now();
    await saveQueueList(store, keys.processing, processing);

    logger.info('[Queue] Request dequeued for processing', {
      requestId,
      protocolId: request.protocolId,
    });

    return updatedRequest;
  } catch (error) {
    logger.error('[Queue] Failed to parse request data', { requestId, error });
    return null;
  }
}

/**
 * Mark a request as completed.
 */
export async function completeRequest(
  requestId: string,
  result: {
    txHash?: string;
    userOpHash?: string;
    actualCostUSD?: number;
  }
): Promise<void> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  // Get current request data
  const requestData = await store.get(keys.request(requestId));
  if (!requestData) {
    logger.warn('[Queue] Cannot complete - request not found', { requestId });
    return;
  }

  await acquireLock(store);

  try {
    const request = JSON.parse(requestData) as SponsorshipRequest;

    // Update to completed
    const updatedRequest: SponsorshipRequest = {
      ...request,
      status: 'completed',
      completedAt: Date.now(),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      actualCostUSD: result.actualCostUSD,
    };

    await store.set(
      keys.request(requestId),
      JSON.stringify(updatedRequest),
      { px: REQUEST_TTL_MS }
    );

    // Remove from processing list
    const processing = await getQueueList(store, keys.processing);
    processing.items = processing.items.filter((id) => id !== requestId);
    processing.updatedAt = Date.now();
    await saveQueueList(store, keys.processing, processing);

    // Add to completed list (trim to max)
    const completed = await getQueueList(store, keys.completed);
    completed.items.unshift(requestId);
    if (completed.items.length > MAX_COMPLETED_ITEMS) {
      completed.items = completed.items.slice(0, MAX_COMPLETED_ITEMS);
    }
    completed.updatedAt = Date.now();
    await saveQueueList(store, keys.completed, completed);

    logger.info('[Queue] Request completed', {
      requestId,
      txHash: result.txHash?.slice(0, 18) + '...',
      actualCostUSD: result.actualCostUSD,
    });
  } catch (error) {
    logger.error('[Queue] Failed to complete request', { requestId, error });
  }
}

/**
 * Mark a request as failed.
 */
export async function failRequest(
  requestId: string,
  error: string,
  shouldRetry: boolean = true
): Promise<void> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  // Get current request data
  const requestData = await store.get(keys.request(requestId));
  if (!requestData) {
    logger.warn('[Queue] Cannot fail - request not found', { requestId });
    return;
  }

  await acquireLock(store);

  try {
    const request = JSON.parse(requestData) as SponsorshipRequest;

    // Remove from processing list first
    const processing = await getQueueList(store, keys.processing);
    processing.items = processing.items.filter((id) => id !== requestId);
    processing.updatedAt = Date.now();
    await saveQueueList(store, keys.processing, processing);

    // Check if should retry
    if (shouldRetry && request.retryCount < request.maxRetries) {
      // Increment retry count and re-queue
      const updatedRequest: SponsorshipRequest = {
        ...request,
        status: 'pending',
        retryCount: request.retryCount + 1,
        error,
        processingStartedAt: undefined,
      };

      await store.set(
        keys.request(requestId),
        JSON.stringify(updatedRequest),
        { px: REQUEST_TTL_MS }
      );

      // Add back to pending
      const pending = await getQueueList(store, keys.pending);
      pending.items.push(requestId);
      pending.updatedAt = Date.now();
      await saveQueueList(store, keys.pending, pending);

      logger.info('[Queue] Request re-queued for retry', {
        requestId,
        retryCount: updatedRequest.retryCount,
        maxRetries: updatedRequest.maxRetries,
        error,
      });
      return;
    }

    // Mark as permanently failed
    const updatedRequest: SponsorshipRequest = {
      ...request,
      status: 'failed',
      failedAt: Date.now(),
      error,
    };

    await store.set(
      keys.request(requestId),
      JSON.stringify(updatedRequest),
      { px: REQUEST_TTL_MS }
    );

    // Add to failed list
    const failed = await getQueueList(store, keys.failed);
    failed.items.unshift(requestId);
    if (failed.items.length > MAX_FAILED_ITEMS) {
      failed.items = failed.items.slice(0, MAX_FAILED_ITEMS);
    }
    failed.updatedAt = Date.now();
    await saveQueueList(store, keys.failed, failed);

    logger.warn('[Queue] Request failed permanently', {
      requestId,
      error,
      retryCount: request.retryCount,
    });
  } catch (err) {
    logger.error('[Queue] Failed to mark request as failed', { requestId, err });
  }
}

/**
 * Mark a request as rejected (policy violation, not retryable).
 */
export async function rejectRequest(
  requestId: string,
  reason: string
): Promise<void> {
  await failRequest(requestId, `Rejected: ${reason}`, false);
}

/**
 * Get request status and details.
 */
export async function getRequestStatus(requestId: string): Promise<SponsorshipRequest | null> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const requestData = await store.get(keys.request(requestId));
  if (!requestData) {
    return null;
  }

  try {
    return JSON.parse(requestData) as SponsorshipRequest;
  } catch {
    return null;
  }
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const [pending, processing, completed, failed] = await Promise.all([
    getQueueList(store, keys.pending),
    getQueueList(store, keys.processing),
    getQueueList(store, keys.completed),
    getQueueList(store, keys.failed),
  ]);

  return {
    pending: pending.items.length,
    processing: processing.items.length,
    completed: completed.items.length,
    failed: failed.items.length,
  };
}

/**
 * Get pending requests list.
 */
export async function getPendingRequests(limit: number = 10): Promise<SponsorshipRequest[]> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const pending = await getQueueList(store, keys.pending);
  const requests: SponsorshipRequest[] = [];

  for (const id of pending.items.slice(0, limit)) {
    const request = await getRequestStatus(id);
    if (request) {
      requests.push(request);
    }
  }

  return requests;
}

/**
 * Recovery: Move stale processing requests back to pending.
 * Call periodically to handle crashed workers.
 */
export async function recoverStaleRequests(): Promise<number> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const locked = await acquireLock(store);
  if (!locked) {
    return 0;
  }

  const processing = await getQueueList(store, keys.processing);
  const now = Date.now();
  let recovered = 0;
  const toRemove: string[] = [];

  for (const requestId of processing.items) {
    const requestData = await store.get(keys.request(requestId));
    if (!requestData) {
      // Request expired, mark for removal
      toRemove.push(requestId);
      continue;
    }

    try {
      const request = JSON.parse(requestData) as SponsorshipRequest;

      // Check if processing timeout exceeded
      if (request.processingStartedAt && now - request.processingStartedAt > PROCESSING_TIMEOUT_MS) {
        toRemove.push(requestId);
        recovered++;

        // Re-queue if retries remaining
        if (request.retryCount < request.maxRetries) {
          const updatedRequest: SponsorshipRequest = {
            ...request,
            status: 'pending',
            retryCount: request.retryCount + 1,
            error: 'Processing timeout - recovered',
            processingStartedAt: undefined,
          };

          await store.set(
            keys.request(requestId),
            JSON.stringify(updatedRequest),
            { px: REQUEST_TTL_MS }
          );

          const pending = await getQueueList(store, keys.pending);
          pending.items.push(requestId);
          pending.updatedAt = Date.now();
          await saveQueueList(store, keys.pending, pending);
        } else {
          // Mark as failed
          const updatedRequest: SponsorshipRequest = {
            ...request,
            status: 'failed',
            failedAt: Date.now(),
            error: 'Processing timeout - max retries exceeded',
          };

          await store.set(
            keys.request(requestId),
            JSON.stringify(updatedRequest),
            { px: REQUEST_TTL_MS }
          );

          const failed = await getQueueList(store, keys.failed);
          failed.items.unshift(requestId);
          failed.updatedAt = Date.now();
          await saveQueueList(store, keys.failed, failed);
        }
      }
    } catch {
      // Invalid data, mark for removal
      toRemove.push(requestId);
    }
  }

  if (toRemove.length > 0) {
    processing.items = processing.items.filter((id) => !toRemove.includes(id));
    processing.updatedAt = Date.now();
    await saveQueueList(store, keys.processing, processing);
  }

  if (recovered > 0) {
    logger.info('[Queue] Recovered stale requests', { recovered });
  }

  return recovered;
}

/**
 * Clear all queue data (for testing).
 */
export async function clearQueue(): Promise<void> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const emptyList = { items: [], updatedAt: Date.now() };

  await Promise.all([
    saveQueueList(store, keys.pending, emptyList),
    saveQueueList(store, keys.processing, emptyList),
    saveQueueList(store, keys.completed, emptyList),
    saveQueueList(store, keys.failed, emptyList),
  ]);

  logger.info('[Queue] Queue cleared');
}
