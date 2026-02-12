/**
 * Gas Passport service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPassport, getPassportByOnChainId } from '../../../src/lib/agent/identity/gas-passport';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('../../../src/lib/db', () => ({
  getPrisma: () => ({
    sponsorshipRecord: mockFindMany
      ? {
          findMany: mockFindMany,
        }
      : undefined,
    agent: mockFindFirst
      ? {
          findFirst: mockFindFirst,
        }
      : undefined,
  }),
}));

describe('Gas Passport', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
  });

  describe('getPassport', () => {
    it('returns zero passport when no records', async () => {
      mockFindMany.mockResolvedValue([]);
      const out = await getPassport('0x1234567890123456789012345678901234567890');
      expect(out).toEqual({
        sponsorCount: 0,
        successRateBps: 0,
        protocolCount: 0,
        firstSponsorTime: 0,
        totalValueSponsored: 0,
        reputationHash: null,
      });
    });

    it('aggregates sponsorCount, protocolCount, successRateBps, totalValueSponsored, firstSponsorTime', async () => {
      const base = new Date('2025-01-01T00:00:00Z');
      const baseTs = Math.floor(base.getTime() / 1000);
      mockFindMany.mockResolvedValue([
        { protocolId: 'p2', estimatedCostUSD: 0.3, actualCostUSD: 0.3, createdAt: base },
        { protocolId: 'p1', estimatedCostUSD: 0.1, actualCostUSD: 0.1, createdAt: new Date(base.getTime() + 1000) },
        { protocolId: 'p1', estimatedCostUSD: 0.2, actualCostUSD: null, createdAt: new Date(base.getTime() + 2000) },
      ]);
      const out = await getPassport('0x1234567890123456789012345678901234567890');
      expect(out.sponsorCount).toBe(3);
      expect(out.protocolCount).toBe(2);
      expect(out.successRateBps).toBe(6667); // 2/3 ≈ 66.67%
      expect(out.firstSponsorTime).toBe(baseTs);
      expect(out.totalValueSponsored).toBe(0.1 + 0.2 + 0.3);
      expect(out.reputationHash).toBeNull();
    });

    it('normalizes agent address to lowercase', async () => {
      mockFindMany.mockResolvedValue([]);
      await getPassport('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userAddress: '0xabcdef1234567890abcdef1234567890abcdef12' },
        })
      );
    });
  });

  describe('getPassportByOnChainId', () => {
    it('returns zero passport when agent not found', async () => {
      mockFindFirst.mockResolvedValue(null);
      const out = await getPassportByOnChainId('42');
      expect(out.sponsorCount).toBe(0);
      expect(out.firstSponsorTime).toBe(0);
    });

    it('delegates to getPassport with agent wallet', async () => {
      mockFindFirst.mockResolvedValue({ walletAddress: '0xagent0000000000000000000000000000000001' });
      mockFindMany.mockResolvedValue([
        {
          protocolId: 'p1',
          estimatedCostUSD: 0.5,
          actualCostUSD: 0.5,
          createdAt: new Date('2025-01-01Z'),
        },
      ]);
      const out = await getPassportByOnChainId('42');
      expect(out.sponsorCount).toBe(1);
      expect(out.totalValueSponsored).toBe(0.5);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userAddress: '0xagent0000000000000000000000000000000001' },
        })
      );
    });
  });
});
