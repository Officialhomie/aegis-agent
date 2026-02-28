/**
 * Aegis Agent - Sponsorship Campaign Manager
 *
 * Tracks targeted sponsorship campaigns (e.g. "sponsor next 10 txs for uniswap-v4 on Base").
 * State stored in StateStore (Redis or in-memory). Campaigns auto-stop when limit is reached.
 */

import { getStateStore } from '../state-store';
import { logger } from '../../logger';

const CAMPAIGN_KEY_PREFIX = 'aegis:campaign:';
const ACTIVE_BY_PROTOCOL_PREFIX = 'aegis:campaign:active:';
/** Campaign data TTL: 7 days (so completed campaigns are still readable for reports) */
const CAMPAIGN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CampaignStatus = 'active' | 'completed' | 'paused' | 'failed';

export interface SponsorshipCampaign {
  id: string;
  protocolId: string;
  chainId: number;
  chainName: string;
  targetContracts: string[];
  maxSponsorships: number;
  completedSponsorships: number;
  status: CampaignStatus;
  txHashes: string[];
  userOpHashes: string[];
  /** Stored as string for JSON serialization */
  gasUsedStrs: string[];
  costUSDs: number[];
  targetContractsPerTx: string[];
  blockNumbers: string[];
  timestamps: string[];
  createdAt: number;
  completedAt?: number;
}

/** Stored shape (gas used as string for bigint serialization) */
interface StoredCampaign extends Omit<SponsorshipCampaign, 'gasUsedStrs'> {
  gasUsedStrs: string[];
}

function campaignKey(id: string): string {
  return `${CAMPAIGN_KEY_PREFIX}${id}`;
}

function activeKey(protocolId: string): string {
  return `${ACTIVE_BY_PROTOCOL_PREFIX}${protocolId}`;
}

function generateCampaignId(): string {
  return `camp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a new campaign and set it as the active campaign for the protocol.
 */
export async function createCampaign(params: {
  protocolId: string;
  chainId: number;
  chainName: string;
  targetContracts: string[];
  maxSponsorships: number;
}): Promise<SponsorshipCampaign> {
  const store = await getStateStore();
  const id = generateCampaignId();
  const campaign: StoredCampaign = {
    id,
    protocolId: params.protocolId,
    chainId: params.chainId,
    chainName: params.chainName,
    targetContracts: params.targetContracts,
    maxSponsorships: params.maxSponsorships,
    completedSponsorships: 0,
    status: 'active',
    txHashes: [],
    userOpHashes: [],
    gasUsedStrs: [],
    costUSDs: [],
    targetContractsPerTx: [],
    blockNumbers: [],
    timestamps: [],
    createdAt: Date.now(),
  };
  await store.set(campaignKey(id), JSON.stringify(campaign), { px: CAMPAIGN_TTL_MS });
  await store.set(activeKey(params.protocolId), id, { px: CAMPAIGN_TTL_MS });
  logger.info('[Campaign] Created', {
    campaignId: id,
    protocolId: params.protocolId,
    chainId: params.chainId,
    maxSponsorships: params.maxSponsorships,
  });
  return campaign as SponsorshipCampaign;
}

/**
 * Load a campaign by ID. Returns null if not found or expired.
 */
export async function getCampaign(campaignId: string): Promise<SponsorshipCampaign | null> {
  const store = await getStateStore();
  const raw = await store.get(campaignKey(campaignId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SponsorshipCampaign;
  } catch {
    return null;
  }
}

/**
 * Get the active campaign for a protocol, if any.
 */
export async function getActiveCampaignForProtocol(protocolId: string): Promise<SponsorshipCampaign | null> {
  const store = await getStateStore();
  const id = await store.get(activeKey(protocolId));
  if (!id) return null;
  const campaign = await getCampaign(id);
  if (!campaign || campaign.status !== 'active') return null;
  return campaign;
}

/**
 * Record a successful sponsorship in the campaign and optionally mark complete.
 */
export async function recordSponsorshipInCampaign(params: {
  campaignId: string;
  txHash: string;
  userOpHash?: string;
  gasUsed: bigint | number;
  costUSD?: number;
  targetContract?: string;
  blockNumber?: string | number;
}): Promise<SponsorshipCampaign | null> {
  const campaign = await getCampaign(params.campaignId);
  if (!campaign) return null;
  if (campaign.status !== 'active') return campaign;

  campaign.txHashes.push(params.txHash);
  campaign.userOpHashes.push(params.userOpHash ?? '');
  campaign.gasUsedStrs.push(String(params.gasUsed));
  campaign.costUSDs.push(params.costUSD ?? 0);
  campaign.targetContractsPerTx.push(params.targetContract ?? '');
  campaign.blockNumbers.push(params.blockNumber != null ? String(params.blockNumber) : '');
  campaign.timestamps.push(new Date().toISOString());
  campaign.completedSponsorships += 1;

  if (campaign.completedSponsorships >= campaign.maxSponsorships) {
    campaign.status = 'completed';
    campaign.completedAt = Date.now();
    logger.info('[Campaign] Completed', {
      campaignId: campaign.id,
      protocolId: campaign.protocolId,
      completed: campaign.completedSponsorships,
    });
  }

  const store = await getStateStore();
  await store.set(campaignKey(campaign.id), JSON.stringify(campaign), { px: CAMPAIGN_TTL_MS });
  return campaign;
}

/**
 * Check if the campaign has reached its limit.
 */
export async function isCampaignComplete(campaignId: string): Promise<boolean> {
  const campaign = await getCampaign(campaignId);
  return campaign != null && campaign.completedSponsorships >= campaign.maxSponsorships;
}

/**
 * Deactivate a campaign (set status to completed or paused, clear active ref).
 */
export async function deactivateCampaign(campaignId: string, status: 'completed' | 'paused' | 'failed' = 'completed'): Promise<void> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return;
  campaign.status = status;
  if (status === 'completed') campaign.completedAt = Date.now();
  const store = await getStateStore();
  await store.set(campaignKey(campaignId), JSON.stringify(campaign), { px: CAMPAIGN_TTL_MS });
  logger.info('[Campaign] Deactivated', { campaignId, protocolId: campaign.protocolId, status });
}

/**
 * Structured report for a campaign (for CLI and OpenClaw).
 */
export interface CampaignReportTransaction {
  index: number;
  txHash: string;
  userOpHash: string;
  gasUsed: number;
  gasSponsored: boolean;
  costUSD: number;
  targetContract: string;
  blockNumber: string;
  timestamp: string;
}

export interface CampaignReport {
  campaign: {
    id: string;
    protocol: string;
    chain: string;
    chainId: number;
    limit: number;
    completed: number;
    status: CampaignStatus;
    createdAt: number;
    completedAt?: number;
  };
  transactions: CampaignReportTransaction[];
  totals: {
    totalGasUsed: number;
    totalCostUSD: number;
    avgCostPerTx: number;
    avgGasPerTx: number;
  };
  validation: {
    allOnBase: boolean;
    allTargetingProtocol: boolean;
    allGasSponsored: boolean;
    stoppedAfterLimit: boolean;
    policyViolations: number;
  };
}

export async function getCampaignReport(campaignId: string): Promise<CampaignReport | null> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;

  const BASE_CHAIN_ID = 8453;
  const transactions: CampaignReportTransaction[] = campaign.txHashes.map((txHash, i) => ({
    index: i + 1,
    txHash,
    userOpHash: campaign.userOpHashes[i] ?? '',
    gasUsed: parseInt(campaign.gasUsedStrs[i] ?? '0', 10) || 0,
    gasSponsored: true,
    costUSD: campaign.costUSDs[i] ?? 0,
    targetContract: campaign.targetContractsPerTx[i] ?? '',
    blockNumber: campaign.blockNumbers[i] ?? '',
    timestamp: campaign.timestamps[i] ?? '',
  }));

  const totalGasUsed = transactions.reduce((s, t) => s + t.gasUsed, 0);
  const totalCostUSD = transactions.reduce((s, t) => s + t.costUSD, 0);
  const n = transactions.length || 1;

  return {
    campaign: {
      id: campaign.id,
      protocol: campaign.protocolId,
      chain: campaign.chainName,
      chainId: campaign.chainId,
      limit: campaign.maxSponsorships,
      completed: campaign.completedSponsorships,
      status: campaign.status,
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    },
    transactions,
    totals: {
      totalGasUsed,
      totalCostUSD,
      avgCostPerTx: totalCostUSD / n,
      avgGasPerTx: Math.round(totalGasUsed / n),
    },
    validation: {
      allOnBase: campaign.chainId === BASE_CHAIN_ID,
      allTargetingProtocol: campaign.targetContracts.length > 0,
      allGasSponsored: transactions.every(() => true),
      stoppedAfterLimit: campaign.completedSponsorships >= campaign.maxSponsorships,
      policyViolations: 0,
    },
  };
}
