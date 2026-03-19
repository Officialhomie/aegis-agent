/**
 * Aegis Agent - Rate Limit Utilities
 *
 * Split into check-only (policy) and record (post-execution) to prevent
 * failed sponsorships from consuming quota (FLAW-9).
 *
 * H2-1: Replaced non-atomic GET/SET JSON array tracking with Redis sorted
 * sets + Lua scripts. All check and record operations are now atomic,
 * preventing the race condition where concurrent workers both see space
 * and both exceed the limit.
 */

import { getConfigNumber } from '../../config';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { RATE_LIMIT_CHECK_SCRIPT, RATE_LIMIT_RECORD_SCRIPT } from './rate-limit-lua';

const MAX_SPONSORSHIPS_PER_USER_DAY = getConfigNumber('MAX_SPONSORSHIPS_PER_USER_DAY', 3, 1, 100);
const MAX_SPONSORSHIPS_PER_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_MINUTE', 10, 1, 100);
const MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE = getConfigNumber('MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE', 5, 1, 50);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Check daily cap for agent (read-only, no increment).
 * Uses atomic Lua script against Redis sorted set.
 * Used by policy validation.
 *
 * Note: `current` is a best-effort conservative estimate for display only.
 * Policy enforcement uses only `passed`.
 */
export async function checkDailyCap(agentWallet: string): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = `aegis:rl:agent:${agentWallet.toLowerCase()}:day`;
  const now = Date.now();
  const result = await store.eval(
    RATE_LIMIT_CHECK_SCRIPT,
    [key],
    [String(MAX_SPONSORSHIPS_PER_USER_DAY), String(ONE_DAY_MS), String(now)]
  );
  const passed = Number(result) === 1;
  // current is conservative: shows limit when denied, limit-1 when allowed (display only)
  const current = passed ? MAX_SPONSORSHIPS_PER_USER_DAY - 1 : MAX_SPONSORSHIPS_PER_USER_DAY;
  return { passed, current, limit: MAX_SPONSORSHIPS_PER_USER_DAY };
}

/**
 * Check global rate limit (read-only, no increment).
 * Uses atomic Lua script against Redis sorted set.
 * Used by policy validation.
 */
export async function checkGlobalRate(): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = 'aegis:rl:global:minute';
  const now = Date.now();
  const result = await store.eval(
    RATE_LIMIT_CHECK_SCRIPT,
    [key],
    [String(MAX_SPONSORSHIPS_PER_MINUTE), String(ONE_MINUTE_MS), String(now)]
  );
  const allowed = Number(result) === 1;
  const current = allowed ? MAX_SPONSORSHIPS_PER_MINUTE - 1 : MAX_SPONSORSHIPS_PER_MINUTE;
  return { passed: allowed, current, limit: MAX_SPONSORSHIPS_PER_MINUTE };
}

/**
 * Check per-protocol rate limit (read-only, no increment).
 * Uses atomic Lua script against Redis sorted set.
 * Used by policy validation.
 */
export async function checkProtocolRate(protocolId: string): Promise<{ passed: boolean; current: number; limit: number }> {
  const store = await getStateStore();
  const key = `aegis:rl:protocol:${protocolId}:minute`;
  const now = Date.now();
  const result = await store.eval(
    RATE_LIMIT_CHECK_SCRIPT,
    [key],
    [String(MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE), String(ONE_MINUTE_MS), String(now)]
  );
  const allowed = Number(result) === 1;
  const current = allowed ? MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE - 1 : MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE;
  return { passed: allowed, current, limit: MAX_SPONSORSHIPS_PER_PROTOCOL_MINUTE };
}

/**
 * Record a successful sponsorship for all rate limits atomically.
 * Call ONLY after bundler confirmation and budget deduction.
 *
 * Uses atomic Lua scripts: each key is updated with ZREMRANGEBYSCORE + ZADD + PEXPIRE
 * in a single Redis round-trip per key, preventing concurrent workers from exceeding limits.
 */
export async function recordSponsorshipForRateLimits(
  agentWallet: string,
  protocolId: string
): Promise<void> {
  const store = await getStateStore();
  const now = Date.now();
  // Unique member ID prevents duplicate entries if the same timestamp is reused
  const uniqueId = `${now}:${Math.random().toString(36).slice(2, 9)}`;

  const dayKey = `aegis:rl:agent:${agentWallet.toLowerCase()}:day`;
  const globalKey = 'aegis:rl:global:minute';
  const protocolKey = `aegis:rl:protocol:${protocolId}:minute`;

  await Promise.all([
    store.eval(RATE_LIMIT_RECORD_SCRIPT, [dayKey], [String(ONE_DAY_MS), String(now), `${uniqueId}:day`]),
    store.eval(RATE_LIMIT_RECORD_SCRIPT, [globalKey], [String(ONE_MINUTE_MS), String(now), `${uniqueId}:global`]),
    store.eval(RATE_LIMIT_RECORD_SCRIPT, [protocolKey], [String(ONE_MINUTE_MS), String(now), `${uniqueId}:protocol`]),
  ]);

  logger.debug('[RateLimit] Recorded sponsorship atomically for all rate limits', {
    agentWallet: agentWallet.slice(0, 10) + '...',
    protocolId,
  });
}
