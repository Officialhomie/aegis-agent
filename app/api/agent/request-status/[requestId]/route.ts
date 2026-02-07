/**
 * Sponsorship Request Status API
 *
 * GET /api/agent/request-status/[requestId]
 *
 * Returns the current status and details of a sponsorship request.
 * Used by agents to track their queued requests.
 */

import { NextResponse } from 'next/server';
import { getRequestStatus, getQueueStats } from '@/src/lib/agent/queue/sponsorship-queue';
import { logger } from '@/src/lib/logger';

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;

    // Handle special case for queue stats
    if (requestId === 'stats') {
      const stats = await getQueueStats();
      return NextResponse.json({
        queue: stats,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate request ID format
    if (!requestId.startsWith('req_')) {
      return NextResponse.json(
        { error: 'Invalid request ID format', requestId },
        { status: 400 }
      );
    }

    // Get request status
    const status = await getRequestStatus(requestId);

    if (!status) {
      return NextResponse.json(
        {
          error: 'Request not found',
          requestId,
          message: 'Request may have expired (24h TTL) or never existed',
        },
        { status: 404 }
      );
    }

    // Build response based on status
    const response: Record<string, unknown> = {
      requestId: status.id,
      status: status.status,
      protocolId: status.protocolId,
      agentAddress: status.agentAddress,
      source: status.source,
      requestedAt: new Date(status.requestedAt).toISOString(),
    };

    // Add status-specific details
    switch (status.status) {
      case 'pending':
        response.message = 'Request is waiting in queue';
        response.retryCount = status.retryCount;
        break;

      case 'processing':
        response.message = 'Request is being processed';
        response.processingStartedAt = status.processingStartedAt
          ? new Date(status.processingStartedAt).toISOString()
          : null;
        break;

      case 'completed':
        response.message = 'Request completed successfully';
        response.completedAt = status.completedAt
          ? new Date(status.completedAt).toISOString()
          : null;
        response.txHash = status.txHash;
        response.userOpHash = status.userOpHash;
        response.actualCostUSD = status.actualCostUSD;
        if (status.txHash) {
          response.explorerUrl = `https://basescan.org/tx/${status.txHash}`;
        }
        break;

      case 'failed':
        response.message = 'Request failed after retries';
        response.failedAt = status.failedAt
          ? new Date(status.failedAt).toISOString()
          : null;
        response.error = status.error;
        response.retryCount = status.retryCount;
        response.maxRetries = status.maxRetries;
        break;

      case 'rejected':
        response.message = 'Request was rejected by policy';
        response.failedAt = status.failedAt
          ? new Date(status.failedAt).toISOString()
          : null;
        response.error = status.error;
        break;
    }

    // Add optional fields if present
    if (status.agentName) {
      response.agentName = status.agentName;
    }
    if (status.targetContract) {
      response.targetContract = status.targetContract;
    }
    if (status.estimatedCostUSD) {
      response.estimatedCostUSD = status.estimatedCostUSD;
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[RequestStatusAPI] Error fetching status', { error: message });

    return NextResponse.json(
      { error: 'Failed to fetch request status', message },
      { status: 500 }
    );
  }
}

/**
 * POST - Cancel a pending request (if supported)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action !== 'cancel') {
      return NextResponse.json(
        { error: 'Invalid action', supported: ['cancel'] },
        { status: 400 }
      );
    }

    // Get current status
    const status = await getRequestStatus(requestId);

    if (!status) {
      return NextResponse.json(
        { error: 'Request not found', requestId },
        { status: 404 }
      );
    }

    // Only pending requests can be cancelled
    if (status.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Cannot cancel request',
          currentStatus: status.status,
          message: 'Only pending requests can be cancelled',
        },
        { status: 409 }
      );
    }

    // Reject the request
    const { rejectRequest } = await import('@/src/lib/agent/queue/sponsorship-queue');
    await rejectRequest(requestId, 'Cancelled by user');

    logger.info('[RequestStatusAPI] Request cancelled', { requestId });

    return NextResponse.json({
      success: true,
      requestId,
      action: 'cancelled',
      message: 'Request has been cancelled',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[RequestStatusAPI] Error cancelling request', { error: message });

    return NextResponse.json(
      { error: 'Failed to cancel request', message },
      { status: 500 }
    );
  }
}
