/**
 * Aegis Agent - Rate Limit Utilities
 *
 * Split into check-only (policy) and record (post-execution) to prevent
 * failed sponsorships from consuming quota (FLAW-9).
 */

import { getConfigNumber } from '../../config';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';

const MAX_SPONSORSHIPS_PER_USER_DAY = getConfigNumber('MAX_SPONSORSHIPS_PER_USER_DAY', 3, 1, 100);
const MAX_SPONSORSHIPS_PER_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_MINUTE', 10, 1, 100);
const MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE', 5, 1, 50);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

function parseTimestampList(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? (parsed as number[]) : [];
    return list.some((x) => typeof x !== 'number') ? [] : list;
  } catch {
    return [];
  }
}

/**
 * Check daily cap for agent (read-only, no increment).
 * Used by policy validation.
 */
export async function checkDailyCap(agentWallet: string): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = `aegis:sponsorship:agent:${agentWallet.toLowerCase()}:day`;
  const raw = await store.get(key);
  const list = parseTimestampList(raw);
  const now = Date.now();
  const trimmed = list.filter((t) => now - t < ONE_DAY_MS);
  const passed = trimmed.length < MAX_SPONSORSHIPS_PER_USER_DAY;
  return { passed, current: trimmed.length, limit: MAX_SPONSORSHIPS_PER_USER_DAY };
}

/**
 * Check global rate limit (read-only, no increment).
 * Used by policy validation.
 */
export async function checkGlobalRate(): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = 'aegis:sponsorship:global:minute';
  const raw = await store.get(key);
  const list = parseTimestampList(raw);
  const now = Date.now();
  const trimmed = list.filter((t) => now - t < ONE_MINUTE_MS);
  const passed = trimmed.length < MAX_SPONSORSHIPS_PER_MINUTE;
  return { passed, current: trimmed.length, limit: MAX_SPONSORSHIPS_PER_MINUTE };
}

/**
 * Check per-protocol rate limit (read-only, no increment).
 * Used by policy validation.
 */
export async function checkProtocolRate(protocolId: string): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = `aegis:sponsorship:protocol:${protocolId}:minute`;
  const raw = await store.get(key);
  const list = parseTimestampList(raw);
  const now = Date.now();
  const trimmed = list.filter((t) => now - t < ONE_MINUTE_MS);
  const passed = trimmed.length < MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE;
  return { passed, current: trimmed.length, limit: MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE };
}

/**
 * Record a successful sponsorship for all rate limits.
 * Call ONLY after bundler confirmation and budget deduction.
 */
export async function recordSponsorshipForRateLimits(
  agentWallet: string,
  protocolId: string
): Promise<void> {
  const store = await getStateStore();
  const now = Date.now();

  const dayKey = `aegis:sponsorship:agent:${agentWallet.toLowerCase()}:day`;
  const dayRaw = await store.get(dayKey);
  const dayList = parseTimestampList(dayRaw);
  const dayTrimmed = dayList.filter((t) => now - t < ONE_DAY_MS);
  dayTrimmed.push(now);
  await store.set(dayKey, JSON.stringify(dayTrimmed), { px: ONE_DAY_MS });

  const globalKey = 'aegis:sponsorship:global:minute';
  const globalRaw = await store.get(globalKey);
  const globalList = parseTimestampList(globalRaw);
  const globalTrimmed = globalList.filter((t) => now - t < ONE_MINUTE_MS);
  globalTrimmed.push(now);
  await store.set(globalKey, JSON.stringify(globalTrimmed), { px: ONE_MINUTE_MS });

  const protocolKey = `aegis:sponsorship:protocol:${protocolId}:minute`;
  const protocolRaw = await store.get(protocolKey);
  const protocolList = parseTimestampList(protocolRaw);
  const protocolTrimmed = protocolList.filter((t) => now - t < ONE_MINUTE_MS);
  protocolTrimmed.push(now);
  await store.set(protocolKey, JSON.stringify(protocolTrimmed), { px: ONE_MINUTE_MS });

  logger.debug('[RateLimit] Recorded sponsorship for rate limits', {
    agentWallet: agentWallet.slice(0, 10) + '...',
    protocolId,
  });
}
