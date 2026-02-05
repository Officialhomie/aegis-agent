/**
 * Aegis Agent - Reputation Attestor Skill
 *
 * Issues on-chain reputation attestations for agents Aegis has successfully sponsored.
 * Uses ERC-8004 Reputation Registry to build a trust network.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { getPrisma } from '../../db';
import { submitReputationAttestation, calculateQualityScore } from '../identity/reputation';
import { getOnchainTxCount } from '../observe';
import type { Skill, SkillContext, SkillResult, SkillEvent } from './index';

/** State key for attested addresses */
const ATTESTED_ADDRESSES_KEY = 'reputation:attestedAddresses';

/** Minimum historical transactions to be eligible for attestation */
const MIN_TX_COUNT_FOR_ATTESTATION = 10;

/** Maximum attestations per skill execution */
const MAX_ATTESTATIONS_PER_RUN = 5;

/** Cooldown between attestations for the same address (7 days) */
const ATTESTATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Attestation record stored in state
 */
interface AttestationRecord {
  address: string;
  lastAttestedAt: string;
  totalAttestations: number;
  totalSponsored: number;
}

/**
 * Get attestation records from state
 */
async function getAttestationRecords(): Promise<Map<string, AttestationRecord>> {
  const store = await getStateStore();
  const data = await store.get(ATTESTED_ADDRESSES_KEY);
  if (!data) return new Map();

  try {
    const records = JSON.parse(data) as AttestationRecord[];
    return new Map(records.map((r) => [r.address.toLowerCase(), r]));
  } catch {
    return new Map();
  }
}

/**
 * Save attestation records
 */
async function saveAttestationRecords(records: Map<string, AttestationRecord>): Promise<void> {
  const store = await getStateStore();
  const recordList = Array.from(records.values());
  await store.set(ATTESTED_ADDRESSES_KEY, JSON.stringify(recordList));
}

/**
 * Check if an address is eligible for attestation
 */
async function isEligibleForAttestation(
  address: string,
  records: Map<string, AttestationRecord>
): Promise<{ eligible: boolean; reason: string }> {
  const existingRecord = records.get(address.toLowerCase());

  // Check cooldown
  if (existingRecord) {
    const lastAttested = new Date(existingRecord.lastAttestedAt).getTime();
    if (Date.now() - lastAttested < ATTESTATION_COOLDOWN_MS) {
      return { eligible: false, reason: 'Attestation cooldown not elapsed' };
    }
  }

  // Check transaction history
  try {
    const txCount = await getOnchainTxCount(address as `0x${string}`);
    if (txCount < MIN_TX_COUNT_FOR_ATTESTATION) {
      return {
        eligible: false,
        reason: `Insufficient transaction history (${txCount}/${MIN_TX_COUNT_FOR_ATTESTATION})`,
      };
    }
  } catch {
    // If we can't get tx count, skip attestation
    return { eligible: false, reason: 'Unable to verify transaction history' };
  }

  return { eligible: true, reason: 'Eligible for attestation' };
}

/**
 * Get recent sponsorship records that haven't been attested
 */
async function getUnattestendSponsorships(
  attestedRecords: Map<string, AttestationRecord>,
  limit: number
): Promise<Array<{ userAddress: string; protocolId: string; txHash: string | null; estimatedCostUSD: number }>> {
  const db = getPrisma();

  // Get sponsorships from last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const sponsorships = await db.sponsorshipRecord.findMany({
    where: {
      createdAt: { gte: since },
      txHash: { not: null },
    },
    select: {
      userAddress: true,
      protocolId: true,
      txHash: true,
      estimatedCostUSD: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Filter to unique addresses not recently attested
  const seen = new Set<string>();
  const eligible: typeof sponsorships = [];

  for (const s of sponsorships) {
    const addr = s.userAddress.toLowerCase();
    if (seen.has(addr)) continue;
    seen.add(addr);

    const record = attestedRecords.get(addr);
    if (record) {
      const lastAttested = new Date(record.lastAttestedAt).getTime();
      if (Date.now() - lastAttested < ATTESTATION_COOLDOWN_MS) {
        continue;
      }
    }

    eligible.push(s);
    if (eligible.length >= limit) break;
  }

  return eligible;
}

/**
 * Execute the Reputation Attestor skill
 */
async function execute(context: SkillContext): Promise<SkillResult> {
  const dryRun = context.dryRun ?? false;

  // Check if triggered by sponsorship event
  const isEventTriggered = context.event === 'sponsorship:success';
  const eventData = context.eventData as {
    userAddress?: string;
    protocolId?: string;
    txHash?: string;
  } | undefined;

  try {
    const attestedRecords = await getAttestationRecords();
    const attestations: Array<{ address: string; success: boolean; reason: string }> = [];

    // If triggered by event, process that specific sponsorship
    if (isEventTriggered && eventData?.userAddress) {
      const address = eventData.userAddress;
      const eligibility = await isEligibleForAttestation(address, attestedRecords);

      if (!eligibility.eligible) {
        return {
          success: true,
          summary: `Skipped attestation for ${address.slice(0, 10)}...: ${eligibility.reason}`,
          data: { skipped: true, reason: eligibility.reason },
        };
      }

      if (!dryRun) {
        try {
          const attestationId = await submitReputationAttestation({
            agentOnChainId: address,
            attestor: 'aegis-paymaster',
            attestationType: 'SUCCESS',
            score: 85, // High score for successful sponsorship
            chainId: 8453, // Base
            txHash: eventData.txHash,
            metadata: {
              type: 'sponsorship',
              protocolId: eventData.protocolId,
              attestedBy: 'aegis-reputation-attestor',
              timestamp: new Date().toISOString(),
            },
          });

          // Update record
          const existingRecord = attestedRecords.get(address.toLowerCase());
          attestedRecords.set(address.toLowerCase(), {
            address: address.toLowerCase(),
            lastAttestedAt: new Date().toISOString(),
            totalAttestations: (existingRecord?.totalAttestations ?? 0) + 1,
            totalSponsored: (existingRecord?.totalSponsored ?? 0) + 1,
          });

          await saveAttestationRecords(attestedRecords);

          logger.info('[ReputationAttestor] Issued attestation', {
            address,
            attestationId,
          });

          attestations.push({ address, success: true, reason: 'Attestation issued' });
        } catch (error) {
          attestations.push({
            address,
            success: false,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        attestations.push({
          address,
          success: true,
          reason: '[DRY RUN] Would issue attestation',
        });
      }
    } else {
      // Scheduled run: process unattested sponsorships
      const unattested = await getUnattestendSponsorships(attestedRecords, MAX_ATTESTATIONS_PER_RUN);

      for (const sponsorship of unattested) {
        const eligibility = await isEligibleForAttestation(sponsorship.userAddress, attestedRecords);

        if (!eligibility.eligible) {
          attestations.push({
            address: sponsorship.userAddress,
            success: false,
            reason: eligibility.reason,
          });
          continue;
        }

        if (!dryRun) {
          try {
            const attestationId = await submitReputationAttestation({
              agentOnChainId: sponsorship.userAddress,
              attestor: 'aegis-paymaster',
              attestationType: 'SUCCESS',
              score: 85,
              chainId: 8453,
              txHash: sponsorship.txHash ?? undefined,
              metadata: {
                type: 'sponsorship',
                protocolId: sponsorship.protocolId,
                costUSD: sponsorship.estimatedCostUSD,
                attestedBy: 'aegis-reputation-attestor',
                timestamp: new Date().toISOString(),
              },
            });

            const existingRecord = attestedRecords.get(sponsorship.userAddress.toLowerCase());
            attestedRecords.set(sponsorship.userAddress.toLowerCase(), {
              address: sponsorship.userAddress.toLowerCase(),
              lastAttestedAt: new Date().toISOString(),
              totalAttestations: (existingRecord?.totalAttestations ?? 0) + 1,
              totalSponsored: (existingRecord?.totalSponsored ?? 0) + 1,
            });

            logger.info('[ReputationAttestor] Issued batch attestation', {
              address: sponsorship.userAddress,
              attestationId,
            });

            attestations.push({
              address: sponsorship.userAddress,
              success: true,
              reason: 'Attestation issued',
            });
          } catch (error) {
            attestations.push({
              address: sponsorship.userAddress,
              success: false,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          attestations.push({
            address: sponsorship.userAddress,
            success: true,
            reason: '[DRY RUN] Would issue attestation',
          });
        }
      }

      // Save updated records
      if (!dryRun && attestations.some((a) => a.success)) {
        await saveAttestationRecords(attestedRecords);
      }
    }

    const successful = attestations.filter((a) => a.success).length;
    const failed = attestations.filter((a) => !a.success).length;

    return {
      success: true,
      summary: `Processed ${attestations.length} attestations: ${successful} successful, ${failed} failed`,
      data: {
        attestations,
        totalRecords: attestedRecords.size,
        dryRun,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Reputation Attestor Skill Definition
 */
export const reputationAttestorSkill: Skill = {
  name: 'reputation-attestor',
  description: 'Issue on-chain reputation attestations for sponsored agents',
  trigger: 'event',
  events: ['sponsorship:success' as SkillEvent],
  enabled: true,
  execute,
};

/**
 * Alternative scheduled version for batch processing
 */
export const reputationAttestorBatchSkill: Skill = {
  name: 'reputation-attestor-batch',
  description: 'Batch process reputation attestations for unattested sponsorships',
  trigger: 'schedule',
  interval: 6 * 60 * 60 * 1000, // Every 6 hours
  enabled: true,
  execute,
};
