/**
 * Paymaster execution tests (signDecision, sponsorTransaction, executePaymasterSponsorship)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signDecision,
  sponsorTransaction,
  executePaymasterSponsorship,
  deductProtocolBudget,
} from '../../src/lib/agent/execute/paymaster';
import type { Decision } from '../../src/lib/agent/reason/schemas';

const mockProtocolSponsorFindUnique = vi.hoisted(() => vi.fn());
const mockExecuteRaw = vi.hoisted(() => vi.fn());
const mockSponsorshipRecordCreate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/lib/db', () => ({
  getPrisma: () => ({
    protocolSponsor: {
      findUnique: mockProtocolSponsorFindUnique,
    },
    $executeRaw: mockExecuteRaw,
    sponsorshipRecord: { create: mockSponsorshipRecordCreate },
    agentSpendLedger: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'ledger-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    approvedAgent: { findUnique: vi.fn().mockResolvedValue({ maxDailyBudget: 100 }) },
  }),
}));

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
    eval: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock('../../src/lib/agent/budget', () => ({
  reserveAgentBudget: vi.fn().mockResolvedValue({ reserved: true, reservationId: 'test-reservation-id' }),
  commitReservation: vi.fn().mockResolvedValue(undefined),
  releaseReservation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/cache', () => ({
  getCachedProtocolWhitelist: vi.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']),
  updateCachedProtocolBudget: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/ipfs', () => ({
  uploadDecisionToIPFS: vi.fn().mockResolvedValue({ success: false, reason: 'not_configured', error: 'No IPFS' }),
}));

vi.mock('../../src/lib/agent/execute/nonce-manager', () => ({
  getNonce: vi.fn().mockResolvedValue(BigInt(0)),
}));

vi.mock('../../src/lib/agent/observe/oracles', () => ({
  getEthPriceUSD: vi.fn().mockResolvedValue(2500),
}));


vi.mock('../../src/lib/agent/execute/paymaster-signer', () => ({
  signPaymasterApproval: vi.fn().mockResolvedValue({
    paymasterAndData: ('0x' + '0'.repeat(320)) as `0x${string}`,
    approvalHash: ('0x' + '0'.repeat(64)) as `0x${string}`,
    validUntil: Math.floor(Date.now() / 1000) + 300,
    validAfter: Math.floor(Date.now() / 1000),
  }),
}));

const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('signDecision', () => {
  beforeEach(() => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', mockPrivateKey);
  });

  it('returns SignedDecision with decisionHash and signature', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test sponsorship decision.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.12,
      },
    };
    const signed = await signDecision(decision);
    expect(signed).toHaveProperty('decisionHash');
    expect(signed.decisionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(signed).toHaveProperty('signature');
    expect(signed.signature).toMatch(/^0x/);
    expect(signed.decision).toEqual(decision);
    expect(signed.decisionJSON).toContain('SPONSOR_TRANSACTION');
  });
});

describe('sponsorTransaction', () => {
  beforeEach(() => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', mockPrivateKey);
    vi.stubEnv('ACTIVITY_LOGGER_ADDRESS', '');
    mockProtocolSponsorFindUnique.mockResolvedValue({
      balanceUSD: 100,
      whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
    });
    mockExecuteRaw.mockResolvedValue(1);
  });

  it('rejects non-SPONSOR_TRANSACTION decision', async () => {
    const decision: Decision = {
      action: 'WAIT',
      confidence: 0.5,
      reasoning: 'Wait.',
      parameters: null,
    };
    const result = await sponsorTransaction(decision, 'LIVE');
    expect(result.success).toBe(false);
    expect(result.error).toContain('SPONSOR_TRANSACTION');
  });

  it('returns simulation result in SIMULATION mode without on-chain log', async () => {
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test sponsorship for simulation.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.12,
      },
    };
    const result = await sponsorTransaction(decision, 'SIMULATION');
    expect(result.success).toBe(true);
    expect(result.decisionHash).toBeDefined();
    expect(result.signature).toBeDefined();
    expect(result.simulationResult).toHaveProperty('action', 'SPONSOR_TRANSACTION');
    expect(result.simulationResult).toHaveProperty('message');
  });

  it('does not throw when sponsorshipRecord.create fails (fail-closed: error logged, result still returned)', async () => {
    mockSponsorshipRecordCreate.mockRejectedValueOnce(new Error('Connection refused'));
    const decision: Decision & { _executionMode?: 'LIVE' | 'SIMULATION'; _validatedTier?: number } = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Test sponsorship when DB record create fails.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.12,
      },
    };
    (decision as any)._executionMode = 'SIMULATION'; // Use simulation so executePaymasterSponsorship returns success without bundler
    (decision as any)._validatedTier = 2;
    const result = await sponsorTransaction(decision, 'LIVE');
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result.decisionHash).toBeDefined();
    expect(result.signature).toBeDefined();
    expect(mockSponsorshipRecordCreate).toHaveBeenCalled();
  });
});

describe('executePaymasterSponsorship', () => {
  beforeEach(() => {
    vi.stubEnv('BUNDLER_RPC_URL', '');
  });

  it('returns paymasterReady false when BUNDLER_RPC_URL not set', async () => {
    const result = await executePaymasterSponsorship({
      agentWallet: '0x1234567890123456789012345678901234567890',
      maxGasLimit: 200000,
    });
    expect(result.paymasterReady).toBe(false);
    expect(result.error).toContain('BUNDLER_RPC_URL');
  });
});

describe('deductProtocolBudget', () => {
  beforeEach(() => {
    mockProtocolSponsorFindUnique.mockReset();
    mockExecuteRaw.mockReset();
  });

  it('returns success: true when atomic update succeeds', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockProtocolSponsorFindUnique.mockResolvedValue({ balanceUSD: 90 });
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it('returns success: false when atomic update affects 0 rows (insufficient budget)', async () => {
    mockExecuteRaw.mockResolvedValue(0);
    mockProtocolSponsorFindUnique.mockResolvedValue({ balanceUSD: 5 });
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient budget');
  });

  it('returns success: false when protocol not found', async () => {
    mockExecuteRaw.mockResolvedValue(0);
    mockProtocolSponsorFindUnique.mockResolvedValue(null);
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns success: false when database throws', async () => {
    mockExecuteRaw.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection refused');
  });
});
