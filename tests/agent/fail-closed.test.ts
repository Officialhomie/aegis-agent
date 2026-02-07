/**
 * Fail-closed tests: DB unavailable must block sponsorship (not silently pass).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockEnv } from '../utils/test-helpers';
import type { Decision } from '../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../src/lib/agent';

const mockProtocolFindUnique = vi.fn().mockResolvedValue({
  protocolId: 'test-protocol',
  whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
});
const mockApprovedAgentFindUnique = vi.fn();

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ protocolId: 'test', balanceUSD: 100, totalSpent: 0 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 0, chainId: 84532 }),
}));

vi.mock('../../src/lib/agent/observe/oracles', () => ({
  getPrice: vi.fn().mockResolvedValue({ price: '2000' }),
}));

vi.mock('../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));

const mockStoreGet = vi.fn().mockResolvedValue(null);
const mockStoreSet = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockStoreGet,
    set: mockStoreSet,
  }),
}));

vi.mock('../../src/lib/agent/security/abuse-detection', () => ({
  detectAbuse: vi.fn().mockResolvedValue({ isAbusive: false }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    protocolSponsor = { findUnique: mockProtocolFindUnique };
    approvedAgent = { findUnique: mockApprovedAgentFindUnique };
  },
}));

describe('Fail-closed: DB unavailable blocks sponsorship', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProtocolFindUnique.mockResolvedValue({
      protocolId: 'test-protocol',
      whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
    });
    mockStoreGet.mockResolvedValue(null);
    restoreEnv = mockEnv({ REQUIRE_AGENT_APPROVAL: 'true' });
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('approved-agent-check fails closed when database throws', async () => {
    mockApprovedAgentFindUnique.mockRejectedValueOnce(new Error('Connection refused'));

    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const config: AgentConfig = {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
      currentGasPriceGwei: 1.5,
    };
    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.9,
      reasoning: 'Valid sponsorship for fail-closed test.',
      parameters: {
        agentWallet: '0x1234567890123456789012345678901234567890',
        protocolId: 'test-protocol',
        maxGasLimit: 200000,
        estimatedCostUSD: 0.5,
      },
    };

    const result = await validatePolicy(decision, config);

    expect(result.passed).toBe(false);
    expect(result.errors).toBeDefined();
    const dbError = result.errors?.find(
      (e) =>
        e.toLowerCase().includes('database') &&
        (e.toLowerCase().includes('unavailable') || e.toLowerCase().includes('failing closed'))
    );
    expect(dbError).toBeDefined();
  });
});
