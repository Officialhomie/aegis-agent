/**
 * Approved-agent-check policy rule tests
 *
 * Agent A approved, Agent B rejected, Agent C revoked,
 * daily budget exceeded, DB unavailable fail-closed, REQUIRE_AGENT_APPROVAL=false.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockEnv } from '../utils/test-helpers';
import type { Decision } from '../../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../../src/lib/agent';

const AGENT_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const AGENT_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AGENT_C = '0xcccccccccccccccccccccccccccccccccccccccc';
const PROTOCOL_ID = 'test-protocol';

const mockProtocolFindUnique = vi.fn().mockResolvedValue({
  protocolId: PROTOCOL_ID,
  whitelistedContracts: [AGENT_A],
});
const mockApprovedAgentFindUnique = vi.fn();

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ protocolId: PROTOCOL_ID, balanceUSD: 100, totalSpent: 0 }),
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

function makeDecision(agentWallet: string, estimatedCostUSD: number = 0.5): Decision {
  return {
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Valid sponsorship for approved agent check test.',
    parameters: {
      agentWallet,
      protocolId: PROTOCOL_ID,
      maxGasLimit: 200000,
      estimatedCostUSD,
    },
  };
}

const config: AgentConfig = {
  confidenceThreshold: 0.8,
  maxTransactionValueUsd: 100,
  executionMode: 'SIMULATION',
  currentGasPriceGwei: 1.5,
};

describe('approved-agent-check rule', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProtocolFindUnique.mockResolvedValue({
      protocolId: PROTOCOL_ID,
      whitelistedContracts: [AGENT_A],
    });
    mockStoreGet.mockResolvedValue(null);
    restoreEnv = mockEnv({ REQUIRE_AGENT_APPROVAL: 'true' });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('passes when agent A is approved and active', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue({
      isActive: true,
      maxDailyBudget: 10,
    });
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_A), config);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when agent B is not approved (no row)', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue(null);
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_B), config);
    expect(result.passed).toBe(false);
    const err = result.errors?.find((e) => e.toLowerCase().includes('not approved'));
    expect(err).toBeDefined();
  });

  it('fails when agent C is approved but revoked (isActive: false)', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue({
      isActive: false,
      maxDailyBudget: 10,
    });
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_C), config);
    expect(result.passed).toBe(false);
    const err = result.errors?.find((e) => e.toLowerCase().includes('revoked'));
    expect(err).toBeDefined();
  });

  it('fails when agent A daily budget exceeded', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue({
      isActive: true,
      maxDailyBudget: 1,
    });
    mockStoreGet.mockResolvedValue('0.95');
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_A, 0.5), config);
    expect(result.passed).toBe(false);
    const err = result.errors?.find((e) => e.toLowerCase().includes('daily budget exceeded'));
    expect(err).toBeDefined();
  });

  it('fails closed when database throws (database unavailable)', async () => {
    mockApprovedAgentFindUnique.mockRejectedValueOnce(new Error('Connection refused'));
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_A), config);
    expect(result.passed).toBe(false);
    const err = result.errors?.find(
      (e) => e.toLowerCase().includes('database') && e.toLowerCase().includes('unavailable')
    );
    expect(err).toBeDefined();
  });
});

describe('approved-agent-check when REQUIRE_AGENT_APPROVAL=false', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockProtocolFindUnique.mockResolvedValue({
      protocolId: PROTOCOL_ID,
      whitelistedContracts: [AGENT_B],
    });
    mockStoreGet.mockResolvedValue(null);
    restoreEnv = mockEnv({ REQUIRE_AGENT_APPROVAL: 'false' });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('passes for any agent when REQUIRE_AGENT_APPROVAL is false', async () => {
    mockApprovedAgentFindUnique.mockResolvedValue(null);
    const { validatePolicy } = await import('../../src/lib/agent/policy');
    const result = await validatePolicy(makeDecision(AGENT_B), config);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
