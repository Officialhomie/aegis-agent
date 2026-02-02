/**
 * Aegis Agent - Abuse Detection
 *
 * Detects Sybil attacks, dust spam, and blacklisted addresses for sponsorship safety.
 */

import { getStateStore } from '../state-store';

export interface AbuseResult {
  isAbusive: boolean;
  reason?: string;
}

const SYBIL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const SYBIL_MAX_SAME_SOURCE = 10;

/**
 * Check if multiple wallets sponsored within short time from same funding source (Sybil).
 * Uses state store to track recent sponsorships per funding source (simplified: per user).
 */
export async function checkSybilAttack(agentWallet: string): Promise<AbuseResult> {
  try {
    const store = await getStateStore();
    const key = `aegis:abuse:sybil:${agentWallet.toLowerCase()}`;
    const raw = await store.get(key);
    const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const now = Date.now();
    const trimmed = list.filter((t) => now - t < SYBIL_WINDOW_MS);
    if (trimmed.length >= SYBIL_MAX_SAME_SOURCE) {
      return {
        isAbusive: true,
        reason: `Sybil: ${trimmed.length} sponsorships in 24h from same pattern`,
      };
    }
    return { isAbusive: false };
  } catch {
    return { isAbusive: false };
  }
}

/**
 * Record a sponsorship for Sybil tracking (call after successful sponsorship).
 */
export async function recordSponsorshipForSybil(agentWallet: string): Promise<void> {
  const store = await getStateStore();
  const key = `aegis:abuse:sybil:${agentWallet.toLowerCase()}`;
  const raw = await store.get(key);
  const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  list.push(Date.now());
  const trimmed = list.filter((t) => Date.now() - t < SYBIL_WINDOW_MS);
  await store.set(key, JSON.stringify(trimmed), { px: SYBIL_WINDOW_MS });
}

const DUST_THRESHOLD_ETH = 0.0001;
const DUST_RATIO_ABUSE = 0.8;
const MIN_TXS_FOR_DUST_CHECK = 5;

/**
 * Check for dust spam (high ratio of tiny-value txs). Uses Blockscout when BLOCKSCOUT_API_URL set.
 */
export async function checkDustSpam(agentWallet: string): Promise<AbuseResult> {
  const baseUrl = process.env.BLOCKSCOUT_API_URL?.trim();
  if (!baseUrl) return { isAbusive: false };

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/addresses/${agentWallet}/transactions?page=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { isAbusive: false };
    const data = (await res.json()) as { items?: { value?: string }[] };
    const items = data?.items ?? [];
    if (items.length < MIN_TXS_FOR_DUST_CHECK) return { isAbusive: false };

    const dustThresholdWei = BigInt(Math.floor(DUST_THRESHOLD_ETH * 1e18));
    let dustCount = 0;
    for (const item of items) {
      const value = item?.value ?? '0';
      const wei = BigInt(value);
      if (wei > 0 && wei < dustThresholdWei) dustCount++;
    }
    const ratio = dustCount / items.length;
    if (ratio >= DUST_RATIO_ABUSE) {
      return { isAbusive: true, reason: `Dust spam: ${dustCount}/${items.length} txs below ${DUST_THRESHOLD_ETH} ETH` };
    }
    return { isAbusive: false };
  } catch {
    return { isAbusive: false };
  }
}

/**
 * Check if target contract is in known scam list (env ABUSE_SCAM_CONTRACTS).
 * Call when target contract is known (e.g. from UserOp calldata).
 */
export async function checkScamContract(targetContract: string): Promise<AbuseResult> {
  const raw = process.env.ABUSE_SCAM_CONTRACTS?.trim();
  if (!raw) return { isAbusive: false };
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const target = targetContract.toLowerCase();
  if (list.includes(target)) {
    return { isAbusive: true, reason: 'Target contract on scam list' };
  }
  return { isAbusive: false };
}

/**
 * Check if address is on blacklist (known scammer). Uses env ABUSE_BLACKLIST (comma-separated).
 */
export async function checkBlacklist(agentWallet: string): Promise<AbuseResult> {
  const raw = process.env.ABUSE_BLACKLIST;
  if (!raw?.trim()) return { isAbusive: false };
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const addr = agentWallet.toLowerCase();
  if (list.includes(addr)) {
    return { isAbusive: true, reason: 'Address on abuse blacklist' };
  }
  return { isAbusive: false };
}

/**
 * Run all abuse checks. Returns first abusive result or { isAbusive: false }.
 * Optionally pass targetContract to check against known scam contracts.
 */
export async function detectAbuse(agentWallet: string, targetContract?: string): Promise<AbuseResult> {
  const checks: Promise<AbuseResult>[] = [
    checkSybilAttack(agentWallet),
    checkDustSpam(agentWallet),
    checkBlacklist(agentWallet),
  ];
  if (targetContract) checks.push(checkScamContract(targetContract));
  const results = await Promise.all(checks);
  const abusive = results.find((r) => r.isAbusive);
  return abusive ?? { isAbusive: false };
}
