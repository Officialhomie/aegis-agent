/**
 * Sponsorship observation layer tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseUnavailableError } from '../../src/lib/errors';
import {
  observeBaseSponsorshipOpportunities,
  observeLowGasWallets,
  observeGasPrice,
  observeProtocolBudgets,
  observeAgentReserves,
  observeFailedTransactions,
  observeNewWalletActivations,
  getOnchainTxCount,
  getProtocolBudget,
  getProtocolBudgets,
} from '../../src/lib/agent/observe/sponsorship';

vi.mock('../../src/lib/agent/observe/chains', () => ({
  getDefaultChainName: vi.fn().mockReturnValue('baseSepolia'),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({
      getBalance: vi.fn().mockResolvedValue(BigInt(1e14)),
      getTransactionCount: vi.fn().mockResolvedValue(10),
      getGasPrice: vi.fn().mockResolvedValue(BigInt(1e9)),
    }),
  };
});

vi.mock('../../src/lib/agent/observe/blockchain', () => ({
  getBalance: vi.fn().mockResolvedValue(BigInt(1e14)),
}));

const mockProtocolFindMany = vi.fn().mockResolvedValue([]);

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    protocolSponsor = { findMany: mockProtocolFindMany };
  },
}));

describe('observeBaseSponsorshipOpportunities', () => {
  beforeEach(() => {
    vi.stubEnv('WHITELISTED_LOW_GAS_CANDIDATES', '');
    vi.stubEnv('BLOCKSCOUT_API_URL', '');
  });

  it('returns an array of observations', async () => {
    const result = await observeBaseSponsorshipOpportunities();
    expect(Array.isArray(result)).toBe(true);
  });

  it('includes protocol budgets and reserves when available', async () => {
    const result = await observeBaseSponsorshipOpportunities();
    const ids = result.map((o) => o.id);
    expect(ids.some((id) => id.includes('reserves') || id.includes('gas'))).toBe(true);
  });
});

describe('observeLowGasWallets', () => {
  it('returns empty when no candidates and no Blockscout URL', async () => {
    vi.stubEnv('WHITELISTED_LOW_GAS_CANDIDATES', '');
    vi.stubEnv('BLOCKSCOUT_API_URL', '');
    const result = await observeLowGasWallets();
    expect(result).toEqual([]);
  });

  it('returns observations when WHITELISTED_LOW_GAS_CANDIDATES set', async () => {
    vi.stubEnv('WHITELISTED_LOW_GAS_CANDIDATES', '0x1234567890123456789012345678901234567890');
    const result = await observeLowGasWallets();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('observeGasPrice', () => {
  it('returns observations with gas price data', async () => {
    const result = await observeGasPrice();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('data');
      expect(result[0].data).toHaveProperty('gasPriceGwei');
    }
  });
});

describe('observeProtocolBudgets', () => {
  it('returns array when getProtocolBudgets succeeds', async () => {
    mockProtocolFindMany.mockResolvedValueOnce([
      { protocolId: 'p1', name: 'P1', balanceUSD: 100, totalSpent: 0, whitelistedContracts: [] },
    ]);
    const result = await observeProtocolBudgets();
    expect(Array.isArray(result)).toBe(true);
  });

  it('throws when getProtocolBudgets fails', async () => {
    mockProtocolFindMany.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(observeProtocolBudgets()).rejects.toThrow();
  });
});

describe('getProtocolBudgets', () => {
  it('throws DatabaseUnavailableError when DB fails', async () => {
    mockProtocolFindMany.mockRejectedValueOnce(new Error('Connection refused'));
    const err = await getProtocolBudgets().catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect((err as Error).message).toMatch(/Cannot fetch protocol budgets/);
  });
});

describe('observeAgentReserves', () => {
  it('returns observations with reserve data', async () => {
    const result = await observeAgentReserves();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].data).toHaveProperty('agentReservesETH');
      expect(result[0].data).toHaveProperty('agentReservesUSDC');
    }
  });
});

describe('observeFailedTransactions', () => {
  it('returns empty when BLOCKSCOUT_API_URL not set', async () => {
    vi.stubEnv('BLOCKSCOUT_API_URL', '');
    const result = await observeFailedTransactions();
    expect(result).toEqual([]);
  });
});

describe('observeNewWalletActivations', () => {
  it('returns empty when WHITELISTED_NEW_WALLET_CANDIDATES not set', async () => {
    vi.stubEnv('WHITELISTED_NEW_WALLET_CANDIDATES', '');
    const result = await observeNewWalletActivations();
    expect(result).toEqual([]);
  });
});
