/**
 * Architecture revamp sponsorship integration test.
 *
 * Verifies full cycle (observe -> reason -> validate -> execute) with SPONSOR_TRANSACTION
 * when the new paymaster signer, budget reservation, and tier rules are in place.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSponsorshipCycle } from '../../src/lib/agent';
import type { AgentConfig } from '../../src/lib/agent';

vi.mock('../../src/lib/agent/observe/sponsorship', () => ({
  observeBaseSponsorshipOpportunities: vi.fn().mockResolvedValue([
    {
      id: 'gas-base-1',
      timestamp: new Date(),
      source: 'blockchain',
      chainId: 84532,
      data: { gasPriceGwei: '1.2', chainId: 84532 },
      context: 'Gas price',
    },
  ]),
  observeGasPrice: vi.fn().mockResolvedValue([
    { id: 'gas-1', timestamp: new Date(), source: 'blockchain', chainId: 84532, data: { gasPriceGwei: '1.2' }, context: '' },
  ]),
  getOnchainTxCount: vi.fn().mockResolvedValue(10),
  getProtocolBudget: vi.fn().mockResolvedValue({ protocolId: 'test', balanceUSD: 100, totalSpent: 0 }),
  getAgentWalletBalance: vi.fn().mockResolvedValue({ ETH: 0.5, USDC: 0, chainId: 84532 }),
}));

vi.mock('../../src/lib/agent/reason', () => ({
  reasonAboutSponsorship: vi.fn().mockResolvedValue({
    action: 'SPONSOR_TRANSACTION',
    confidence: 0.9,
    reasoning: 'Valid sponsorship opportunity for architecture revamp test.',
    parameters: {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      maxGasLimit: 200000,
      estimatedCostUSD: 0.5,
    },
  }),
}));

vi.mock('../../src/lib/agent/execute/circuit-breaker', () => ({
  getDefaultCircuitBreaker: vi.fn().mockReturnValue({
    checkHealthBeforeExecution: vi.fn().mockResolvedValue({ healthy: true }),
  }),
}));

vi.mock('../../src/lib/agent/memory', () => ({
  retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
  storeMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
    eval: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock('../../src/lib/agent/validation/account-validator', () => ({
  validateAccount: vi.fn().mockResolvedValue({
    agentTier: 2,
    agentType: 'ERC4337_ACCOUNT',
    isValid: true,
    accountType: 'smart_account',
    reason: 'ERC-4337 compatible',
  }),
}));

vi.mock('../../src/lib/agent/observe/oracles', () => ({
  getPrice: vi.fn().mockResolvedValue({ price: '2000' }),
  getEthPriceUSD: vi.fn().mockResolvedValue(2500),
}));

vi.mock('../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));

vi.mock('../../src/lib/agent/security/abuse-detection', () => ({
  detectAbuse: vi.fn().mockResolvedValue({ isAbusive: false }),
}));

vi.mock('../../src/lib/protocol/onboarding', () => ({
  canExecuteSponsorship: vi.fn().mockResolvedValue({ allowed: true, mode: 'SIMULATION' }),
}));

vi.mock('../../src/lib/protocol/runtime-overrides', () => ({
  getActiveRuntimeOverride: vi.fn().mockResolvedValue(null),
  isWalletBlocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/lib/agent/identity/gas-passport', () => ({
  getPassport: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/db', () => ({
  getPrisma: vi.fn().mockReturnValue({
    protocolSponsor: {
      findUnique: vi.fn().mockResolvedValue({
        protocolId: 'test-protocol',
        whitelistedContracts: ['0x1234567890123456789012345678901234567890'],
        requireERC8004: false,
        requireERC4337: false,
      }),
    },
    approvedAgent: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));

describe('Architecture Revamp Sponsorship', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', '0x0000000000000000000000000000000000000000000000000000000000000001');
  });

  it('completes full cycle with SPONSOR_TRANSACTION in SIMULATION mode', async () => {
    const config: AgentConfig = {
      confidenceThreshold: 0.8,
      maxTransactionValueUsd: 100,
      executionMode: 'SIMULATION',
    };
    const state = await runSponsorshipCycle(config);
    expect(state).toHaveProperty('observations');
    expect(state).toHaveProperty('currentDecision');
    expect(state.currentDecision?.action).toBe('SPONSOR_TRANSACTION');
    expect(state.executionResult).toBeDefined();
    expect(state.executionResult?.success).toBe(true);
    expect(state.executionResult?.simulationResult).toBeDefined();
  });
});
