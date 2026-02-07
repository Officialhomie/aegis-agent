/**
 * Queue consumer and Botchan→queue→processed flow tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SponsorshipRequest } from '../../src/lib/agent/queue/sponsorship-queue';

const mockDequeueRequest = vi.fn();
const mockCompleteRequest = vi.fn();
const mockFailRequest = vi.fn();
const mockRejectRequest = vi.fn();
const mockRecoverStaleRequests = vi.fn().mockResolvedValue(0);
const mockEnqueueRequest = vi.fn().mockResolvedValue({ requestId: 'req_1', position: 1 });
const mockVerifySimpleSignature = vi.fn();
const mockValidatePolicy = vi.fn();
const mockSponsorTransaction = vi.fn();
const mockGetAdaptiveGasSponsorshipConfig = vi.fn();
const mockObserveGasPrice = vi.fn();

vi.mock('../../src/lib/agent/queue/sponsorship-queue', () => ({
  dequeueRequest: () => mockDequeueRequest(),
  completeRequest: (id: string, result: unknown) => mockCompleteRequest(id, result),
  failRequest: (id: string, error: string, retry?: boolean) => mockFailRequest(id, error, retry),
  rejectRequest: (id: string, reason: string) => mockRejectRequest(id, reason),
  recoverStaleRequests: () => mockRecoverStaleRequests(),
  enqueueRequest: (req: unknown) => mockEnqueueRequest(req),
}));

vi.mock('../../src/lib/agent/verify/request-signature', () => ({
  verifySimpleSignature: (req: unknown) => mockVerifySimpleSignature(req),
}));

vi.mock('../../src/lib/agent/policy', () => ({
  validatePolicy: (decision: unknown, config: unknown) => mockValidatePolicy(decision, config),
}));

vi.mock('../../src/lib/agent/execute', () => ({
  sponsorTransaction: (decision: unknown, mode: string) => mockSponsorTransaction(decision, mode),
}));

vi.mock('../../src/lib/agent/modes/gas-sponsorship', () => ({
  getAdaptiveGasSponsorshipConfig: () => mockGetAdaptiveGasSponsorshipConfig(),
}));

vi.mock('../../src/lib/agent/observe', () => ({
  observeGasPrice: () => mockObserveGasPrice(),
}));

const mockGetStateStore = vi.fn().mockResolvedValue({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
});
const mockObserveBotchanRequests = vi.fn().mockResolvedValue([]);

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: () => mockGetStateStore(),
}));

vi.mock('../../src/lib/agent/observe/botchan', () => ({
  observeBotchanRequests: () => mockObserveBotchanRequests(),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeRequest(overrides: Partial<SponsorshipRequest> = {}): SponsorshipRequest {
  return {
    id: 'req_abc123',
    protocolId: 'test-protocol',
    agentAddress: '0x1234567890123456789012345678901234567890',
    source: 'botchan',
    requestedAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    maxRetries: 3,
    estimatedCostUSD: 0.1,
    ...overrides,
  };
}

describe('processQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecoverStaleRequests.mockResolvedValue(0);
    mockGetAdaptiveGasSponsorshipConfig.mockResolvedValue({
      executionMode: 'LIVE',
      confidenceThreshold: 0.8,
    });
    mockObserveGasPrice.mockResolvedValue([{ data: { gasPriceGwei: '1' } }]);
  });

  it('happy path: completes request when policy passes and sponsorship succeeds', async () => {
    const request = makeRequest();
    mockDequeueRequest
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);
    mockValidatePolicy.mockResolvedValue({ passed: true, errors: [] });
    mockSponsorTransaction.mockResolvedValue({
      success: true,
      transactionHash: '0xtx',
      sponsorshipHash: '0xuserop',
    });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockCompleteRequest).toHaveBeenCalledWith(
      request.id,
      expect.objectContaining({
        txHash: '0xtx',
        userOpHash: '0xuserop',
      })
    );
    expect(mockSponsorTransaction).toHaveBeenCalled();
    expect(mockRejectRequest).not.toHaveBeenCalled();
    expect(mockFailRequest).not.toHaveBeenCalled();
    expect(mockRecoverStaleRequests).toHaveBeenCalled();
  });

  it('when request has valid signature, flow continues to policy', async () => {
    const request = makeRequest({
      signature: 'sig',
      signatureTimestamp: Date.now(),
    });
    mockDequeueRequest
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);
    mockVerifySimpleSignature.mockReturnValue({ valid: true });
    mockValidatePolicy.mockResolvedValue({ passed: true, errors: [] });
    mockSponsorTransaction.mockResolvedValue({ success: true, sponsorshipHash: '0xh' });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockVerifySimpleSignature).toHaveBeenCalled();
    expect(mockRejectRequest).not.toHaveBeenCalled();
    expect(mockCompleteRequest).toHaveBeenCalled();
  });

  it('rejects request when signature invalid and does not call sponsorTransaction', async () => {
    const request = makeRequest({
      signature: 'bad',
      signatureTimestamp: Date.now(),
    });
    mockDequeueRequest
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);
    mockVerifySimpleSignature.mockReturnValue({ valid: false, error: 'Invalid signature' });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockRejectRequest).toHaveBeenCalledWith(request.id, expect.any(String));
    expect(mockSponsorTransaction).not.toHaveBeenCalled();
    expect(mockCompleteRequest).not.toHaveBeenCalled();
  });

  it('rejects request when policy fails and does not call sponsorTransaction', async () => {
    const request = makeRequest();
    mockDequeueRequest
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);
    mockValidatePolicy.mockResolvedValue({
      passed: false,
      errors: ['Agent not approved for protocol'],
    });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockRejectRequest).toHaveBeenCalledWith(
      request.id,
      expect.stringContaining('not approved')
    );
    expect(mockSponsorTransaction).not.toHaveBeenCalled();
    expect(mockCompleteRequest).not.toHaveBeenCalled();
  });

  it('calls failRequest when sponsorTransaction returns success: false', async () => {
    const request = makeRequest();
    mockDequeueRequest
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);
    mockValidatePolicy.mockResolvedValue({ passed: true, errors: [] });
    mockSponsorTransaction.mockResolvedValue({
      success: false,
      error: 'Bundler error',
    });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockFailRequest).toHaveBeenCalledWith(request.id, 'Bundler error', true);
    expect(mockCompleteRequest).not.toHaveBeenCalled();
  });

  it('empty queue: recoverStaleRequests still called', async () => {
    mockDequeueRequest.mockResolvedValue(null);

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockDequeueRequest).toHaveBeenCalledTimes(1);
    expect(mockRecoverStaleRequests).toHaveBeenCalledTimes(1);
    expect(mockCompleteRequest).not.toHaveBeenCalled();
  });

  it('processes up to 5 items per run then stops', async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      makeRequest({ id: `req_${i}`, agentAddress: `0x${i.toString().padStart(40, '0')}` })
    );
    mockDequeueRequest
      .mockResolvedValueOnce(requests[0])
      .mockResolvedValueOnce(requests[1])
      .mockResolvedValueOnce(requests[2])
      .mockResolvedValueOnce(requests[3])
      .mockResolvedValueOnce(requests[4])
      .mockResolvedValueOnce(null);
    mockValidatePolicy.mockResolvedValue({ passed: true, errors: [] });
    mockSponsorTransaction.mockResolvedValue({ success: true, sponsorshipHash: '0xh' });

    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();

    expect(mockDequeueRequest).toHaveBeenCalledTimes(5);
    expect(mockCompleteRequest).toHaveBeenCalledTimes(5);
    expect(mockRecoverStaleRequests).toHaveBeenCalledTimes(1);
  });

  it('recoverStaleRequests always called at end of run', async () => {
    mockDequeueRequest.mockResolvedValue(null);
    const { processQueue } = await import('../../src/lib/agent/queue/queue-consumer');
    await processQueue();
    expect(mockRecoverStaleRequests).toHaveBeenCalled();
  });
});

describe('Botchan enqueue to processed flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueRequest.mockResolvedValue({ requestId: 'req_botchan1', position: 1 });
    mockGetStateStore.mockResolvedValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('Botchan listener enqueues request with protocolId and agentAddress when message is sponsorship-style', async () => {
    mockObserveBotchanRequests.mockResolvedValue([
      {
        id: 'botchan-1',
        data: {
          message: 'Please sponsor gas for 0x1234567890123456789012345678901234567890 on test-protocol',
          wallet: '0xRequester',
        },
      },
    ]);

    const { botchanListenerSkill } = await import('../../src/lib/agent/skills/botchan-listener');
    const result = await botchanListenerSkill.execute({ dryRun: false });

    expect(result.success).toBe(true);
    expect(mockEnqueueRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolId: 'test-protocol',
        agentAddress: '0x1234567890123456789012345678901234567890',
        source: 'botchan',
      })
    );
  });
});
