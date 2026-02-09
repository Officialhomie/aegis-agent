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

const mockProtocolSponsorFindUnique = vi.fn();
const mockProtocolSponsorUpdate = vi.fn();
const mockSponsorshipRecordCreate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/db', () => ({
  getPrisma: () => ({
    protocolSponsor: {
      findUnique: mockProtocolSponsorFindUnique,
      update: mockProtocolSponsorUpdate,
    },
    sponsorshipRecord: { create: mockSponsorshipRecordCreate },
  }),
}));

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../src/lib/ipfs', () => ({
  uploadDecisionToIPFS: vi.fn().mockResolvedValue({ success: false, reason: 'not_configured', error: 'No IPFS' }),
}));


vi.mock('viem/account-abstraction', () => ({
  createPaymasterClient: vi.fn().mockReturnValue({}),
  getPaymasterStubData: vi.fn().mockResolvedValue({
    paymaster: '0x0000000000000000000000000000000000000001',
    paymasterData: '0x',
    paymasterPostOpGasLimit: BigInt(10000),
  }),
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
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
    const decision: Decision = {
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
    mockProtocolSponsorUpdate.mockReset();
  });

  it('returns success: true when database update succeeds', async () => {
    mockProtocolSponsorFindUnique.mockResolvedValue({ balanceUSD: 100 });
    mockProtocolSponsorUpdate.mockResolvedValue(undefined);
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns success: false when database update fails', async () => {
    mockProtocolSponsorFindUnique.mockResolvedValue({ balanceUSD: 100 });
    mockProtocolSponsorUpdate.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await deductProtocolBudget('test-protocol', 10);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Connection refused');
  });
});
