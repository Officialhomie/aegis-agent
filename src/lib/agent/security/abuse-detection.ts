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
export async function checkSybilAttack(userAddress: string): Promise<AbuseResult> {
  try {
    const store = await getStateStore();
    const key = `aegis:abuse:sybil:${userAddress.toLowerCase()}`;
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
export async function recordSponsorshipForSybil(userAddress: string): Promise<void> {
  const store = await getStateStore();
  const key = `aegis:abuse:sybil:${userAddress.toLowerCase()}`;
  const raw = await store.get(key);
  const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  list.push(Date.now());
  const trimmed = list.filter((t) => Date.now() - t < SYBIL_WINDOW_MS);
  await store.set(key, JSON.stringify(trimmed), { px: SYBIL_WINDOW_MS });
}

/**
 * Check for dust spam (tiny value txs). Stub: would need tx history per user.
 */
export async function checkDustSpam(_userAddress: string): Promise<AbuseResult> {
  // TODO: integrate with Base indexer for tx value distribution
  return { isAbusive: false };
}

/**
 * Check if address is on blacklist (known scammer). Uses env ABUSE_BLACKLIST (comma-separated).
 */
export async function checkBlacklist(userAddress: string): Promise<AbuseResult> {
  const raw = process.env.ABUSE_BLACKLIST;
  if (!raw?.trim()) return { isAbusive: false };
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const addr = userAddress.toLowerCase();
  if (list.includes(addr)) {
    return { isAbusive: true, reason: 'Address on abuse blacklist' };
  }
  return { isAbusive: false };
}

/**
 * Run all abuse checks. Returns first abusive result or { isAbusive: false }.
 */
export async function detectAbuse(userAddress: string): Promise<AbuseResult> {
  const [sybil, dust, blacklist] = await Promise.all([
    checkSybilAttack(userAddress),
    checkDustSpam(userAddress),
    checkBlacklist(userAddress),
  ]);
  if (sybil.isAbusive) return sybil;
  if (dust.isAbusive) return dust;
  if (blacklist.isAbusive) return blacklist;
  return { isAbusive: false };
}
