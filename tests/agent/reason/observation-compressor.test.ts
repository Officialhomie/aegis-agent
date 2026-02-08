/**
 * Observation Compressor - unit tests
 * Tests token reduction through array truncation, number rounding, address truncation, and field removal.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  compressObservations,
  calculateCompressionRatio,
} from '../../../src/lib/agent/reason/observation-compressor';
import type { Observation } from '../../../src/lib/agent/observe';

describe('observation-compressor', () => {
  describe('compressObservations', () => {
    it('truncates lowGasWallets array to top 5 items', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            lowGasWallets: Array.from({ length: 10 }, (_, i) => ({
              wallet: `0x${String(i).padStart(40, '0')}`,
              balance: 0.001 + i * 0.0001,
              historicalTxs: 5 + i,
            })),
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as { lowGasWallets?: unknown[] };
      expect(data.lowGasWallets).toBeDefined();
      expect(data.lowGasWallets!.length).toBe(5);
    });

    it('truncates Ethereum addresses to 0x1234...5678 format', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            lowGasWallets: [
              {
                wallet: '0x1234567890abcdef1234567890abcdef12345678',
                balance: 0.001,
                historicalTxs: 5,
              },
            ],
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as {
        lowGasWallets?: Array<{ wallet: string }>;
      };
      expect(data.lowGasWallets![0].wallet).toMatch(/^0x[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
      expect(data.lowGasWallets![0].wallet).toBe('0x1234...5678');
    });

    it('rounds gas price to 2 decimals', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            gasPriceGwei: '1.23456789',
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as { gasPriceGwei?: string };
      expect(data.gasPriceGwei).toBe('1.23');
    });

    it('rounds agent reserves (ETH to 4 decimals, USDC to 2)', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            agentReserves: {
              eth: 0.123456789,
              usdc: 123.456789,
            },
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as {
        agentReserves?: { eth: number; usdc: number };
      };
      expect(data.agentReserves!.eth).toBe(0.1235); // 4 decimals
      expect(data.agentReserves!.usdc).toBe(123.46); // 2 decimals
    });

    it('truncates protocolBudgets to top 10 by balance', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            protocolBudgets: Array.from({ length: 15 }, (_, i) => ({
              protocolId: `protocol-${i}`,
              balanceUSD: 1000 - i * 50, // Descending balance
              totalSpent: 100 + i * 10,
            })),
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as { protocolBudgets?: unknown[] };
      expect(data.protocolBudgets).toBeDefined();
      expect(data.protocolBudgets!.length).toBe(10);
    });

    it('rounds protocol budgets to nearest dollar', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            protocolBudgets: [
              {
                protocolId: 'protocol-1',
                balanceUSD: 123.456,
                totalSpent: 45.678,
              },
            ],
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as {
        protocolBudgets?: Array<{ balance: number; spent?: number }>;
      };
      expect(data.protocolBudgets![0].balance).toBe(123); // Rounded
      expect(data.protocolBudgets![0].spent).toBe(46); // Rounded
    });

    it('truncates failedTransactions to first 3', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            failedTransactions: Array.from({ length: 10 }, (_, i) => ({
              agent: `0x${String(i).padStart(40, '0')}`,
              reason: `Error ${i}: Some very long error message that should be truncated`,
            })),
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as { failedTransactions?: unknown[] };
      expect(data.failedTransactions).toBeDefined();
      expect(data.failedTransactions!.length).toBe(3);
    });

    it('truncates failed transaction reason to 50 chars', () => {
      const longReason =
        'This is a very long error message that should definitely be truncated to 50 characters maximum';
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            failedTransactions: [
              {
                agent: '0x1234567890abcdef1234567890abcdef12345678',
                reason: longReason,
              },
            ],
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as {
        failedTransactions?: Array<{ reason: string }>;
      };
      expect(data.failedTransactions![0].reason.length).toBe(50);
    });

    it('truncates treasury tokens to top 5 by USD value', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            tokens: Array.from({ length: 10 }, (_, i) => ({
              symbol: `TOKEN${i}`,
              balance: 100 + i,
              valueUSD: 1000 - i * 100, // Descending value
            })),
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as { tokens?: unknown[] };
      expect(data.tokens).toBeDefined();
      expect(data.tokens!.length).toBe(5);
    });

    it('removes timestamp fields', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            someOtherField: 'keep this',
          },
        },
      ];

      const compressed = compressObservations(observations);
      const data = compressed[0].data as Record<string, unknown>;
      expect(data.timestamp).toBeUndefined();
      expect(data.createdAt).toBeUndefined();
      expect(data.updatedAt).toBeUndefined();
      expect(data.someOtherField).toBe('keep this');
    });

    it('handles observations with no data field', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: null,
        },
      ];

      const compressed = compressObservations(observations);
      expect(compressed[0].data).toBeNull();
    });

    it('handles empty observations array', () => {
      const compressed = compressObservations([]);
      expect(compressed).toEqual([]);
    });
  });

  describe('calculateCompressionRatio', () => {
    it('calculates correct compression ratio', () => {
      const original: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            lowGasWallets: Array.from({ length: 10 }, (_, i) => ({
              wallet: `0x${String(i).padStart(40, '0')}`,
              balance: 0.001234567 + i * 0.0001,
              historicalTxs: 5 + i,
            })),
            gasPriceGwei: '1.23456789',
            agentReserves: {
              eth: 0.123456789,
              usdc: 123.456789,
            },
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
          },
        },
      ];

      const compressed = compressObservations(original);
      const ratio = calculateCompressionRatio(original, compressed);

      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1); // Compressed should be smaller
      expect(ratio).toBeGreaterThan(0.2); // Should save at least 30%
      expect(ratio).toBeLessThan(0.7); // Should save at most 80%
    });

    it('returns ratio close to 1 when little compression possible', () => {
      const original: Observation[] = [
        {
          id: 'obs-1',
          timestamp: new Date(),
          source: 'blockchain',
          data: {
            simpleField: 'value',
          },
        },
      ];

      const compressed = compressObservations(original);
      const ratio = calculateCompressionRatio(original, compressed);

      expect(ratio).toBeGreaterThan(0.8); // Minimal compression
      expect(ratio).toBeLessThanOrEqual(1);
    });
  });
});
