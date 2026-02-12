/**
 * Aegis Agent - Gas Passport (Reputation Primitive)
 *
 * Aggregates sponsorship history into a portable PassportData shape.
 * Compute-on-read from SponsorshipRecord; no separate cache table.
 */

import { getPrisma } from '../../db';

/** Passport data shape (aligns with strategic doc IGasPassport.PassportData) */
export interface PassportData {
  /** Total sponsorships received (SponsorshipRecord count for this agent) */
  sponsorCount: number;
  /** Success rate in basis points (10000 = 100%). Success = bundler succeeded (actualCostUSD set) */
  successRateBps: number;
  /** Unique protocols interacted with */
  protocolCount: number;
  /** Unix timestamp of first sponsorship */
  firstSponsorTime: number;
  /** Total value sponsored in USD (sum of actualCostUSD ?? estimatedCostUSD) */
  totalValueSponsored: number;
  /** Merkle root of detailed history; Phase 2 */
  reputationHash: string | null;
}

const ZERO_PASSPORT: PassportData = {
  sponsorCount: 0,
  successRateBps: 0,
  protocolCount: 0,
  firstSponsorTime: 0,
  totalValueSponsored: 0,
  reputationHash: null,
};

/**
 * Get Gas Passport for an agent by wallet address (SCW/agent address).
 * Aggregates from SponsorshipRecord; success = record has actualCostUSD (bundler succeeded).
 */
export async function getPassport(agentAddress: string): Promise<PassportData> {
  const db = getPrisma();
  if (!db?.sponsorshipRecord) {
    return ZERO_PASSPORT;
  }
  const normalized = agentAddress.toLowerCase();

  const records = await db.sponsorshipRecord.findMany({
    where: { userAddress: normalized },
    select: {
      protocolId: true,
      estimatedCostUSD: true,
      actualCostUSD: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (records.length === 0) {
    return ZERO_PASSPORT;
  }

  const protocols = new Set(records.map((r) => r.protocolId));
  const successCount = records.filter((r) => r.actualCostUSD != null).length;
  const successRateBps = records.length > 0
    ? Math.round((successCount / records.length) * 10_000)
    : 0;
  const firstSponsorTime = Math.floor(records[0].createdAt.getTime() / 1000);
  const totalValueSponsored = records.reduce(
    (sum, r) => sum + (r.actualCostUSD ?? r.estimatedCostUSD),
    0
  );

  return {
    sponsorCount: records.length,
    successRateBps,
    protocolCount: protocols.size,
    firstSponsorTime,
    totalValueSponsored,
    reputationHash: null,
  };
}

/**
 * Get Gas Passport by ERC-8004 agent on-chain ID.
 * Resolves agent wallet via Agent table then delegates to getPassport(wallet).
 */
export async function getPassportByOnChainId(
  agentOnChainId: string
): Promise<PassportData> {
  const db = getPrisma();
  if (!db?.agent) {
    return ZERO_PASSPORT;
  }
  const agent = await db.agent.findFirst({
    where: { onChainId: agentOnChainId },
    select: { walletAddress: true },
  });
  if (!agent?.walletAddress) {
    return ZERO_PASSPORT;
  }
  return getPassport(agent.walletAddress);
}
