export type EntitlementTier = 'FREE' | 'PRO' | 'TEAM';

export interface EntitlementCaps {
  tier: EntitlementTier;
  maxDailySponsoredActions: number;
  premiumMethods: boolean;
  sponsorshipWindowHours: number;
  auditExport: boolean;
  maxAgents: number;
}

export function normalizeTier(raw: string): EntitlementTier {
  const u = raw?.toUpperCase();
  if (u === 'PRO' || u === 'TEAM') return u;
  return 'FREE';
}

export function getCapsForTier(tier: EntitlementTier): EntitlementCaps {
  switch (tier) {
    case 'PRO':
      return {
        tier: 'PRO',
        maxDailySponsoredActions: 50,
        premiumMethods: true,
        sponsorshipWindowHours: 24,
        auditExport: true,
        maxAgents: 5,
      };
    case 'TEAM':
      return {
        tier: 'TEAM',
        maxDailySponsoredActions: 500,
        premiumMethods: true,
        sponsorshipWindowHours: 72,
        auditExport: true,
        maxAgents: 999,
      };
    default:
      return {
        tier: 'FREE',
        maxDailySponsoredActions: 5,
        premiumMethods: false,
        sponsorshipWindowHours: 1,
        auditExport: false,
        maxAgents: 1,
      };
  }
}
