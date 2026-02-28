/**
 * OpenClaw Rate Limiter
 *
 * Prevents abuse by limiting command frequency per session.
 * Uses a sliding window algorithm.
 */

import { logger } from '../../logger';
import { OPENCLAW_RATE_LIMIT_PER_MINUTE } from '../../config/feature-flags';

/**
 * Rate limit entry for a session
 */
interface RateLimitEntry {
  sessionId: string;
  timestamps: number[]; // Command timestamps within the window
  destructiveTimestamps: number[]; // Destructive command timestamps
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_COMMANDS_PER_MINUTE = OPENCLAW_RATE_LIMIT_PER_MINUTE;
const MAX_DESTRUCTIVE_PER_HOUR = 5;
const DESTRUCTIVE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Export constants for testing
export const RATE_LIMITS = {
  maxCommandsPerMinute: MAX_COMMANDS_PER_MINUTE,
  maxDestructivePerHour: MAX_DESTRUCTIVE_PER_HOUR,
  windowMs: WINDOW_MS,
  destructiveWindowMs: DESTRUCTIVE_WINDOW_MS,
};

/**
 * Check if a command is allowed based on rate limits
 */
export function checkRateLimit(
  sessionId: string,
  isDestructive: boolean = false
): { allowed: boolean; retryAfterMs?: number; reason?: string } {
  const now = Date.now();

  // Get or create entry
  let entry = rateLimitStore.get(sessionId);
  if (!entry) {
    entry = {
      sessionId,
      timestamps: [],
      destructiveTimestamps: [],
    };
    rateLimitStore.set(sessionId, entry);
  }

  // Clean up old timestamps
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < WINDOW_MS);
  entry.destructiveTimestamps = entry.destructiveTimestamps.filter(
    (ts) => now - ts < DESTRUCTIVE_WINDOW_MS
  );

  // Check general rate limit
  if (entry.timestamps.length >= MAX_COMMANDS_PER_MINUTE) {
    const oldestTimestamp = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestTimestamp);

    logger.warn('[RateLimiter] Rate limit exceeded', {
      sessionId,
      count: entry.timestamps.length,
      limit: MAX_COMMANDS_PER_MINUTE,
    });

    return {
      allowed: false,
      retryAfterMs,
      reason: `Rate limit exceeded: ${MAX_COMMANDS_PER_MINUTE} commands per minute. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    };
  }

  // Check destructive command limit
  if (isDestructive && entry.destructiveTimestamps.length >= MAX_DESTRUCTIVE_PER_HOUR) {
    const oldestTimestamp = entry.destructiveTimestamps[0];
    const retryAfterMs = DESTRUCTIVE_WINDOW_MS - (now - oldestTimestamp);

    logger.warn('[RateLimiter] Destructive rate limit exceeded', {
      sessionId,
      count: entry.destructiveTimestamps.length,
      limit: MAX_DESTRUCTIVE_PER_HOUR,
    });

    return {
      allowed: false,
      retryAfterMs,
      reason: `Destructive command limit exceeded: ${MAX_DESTRUCTIVE_PER_HOUR} per hour. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`,
    };
  }

  return { allowed: true };
}

/**
 * Record a command execution for rate limiting
 */
export function recordCommand(sessionId: string, isDestructive: boolean = false): void {
  const now = Date.now();

  let entry = rateLimitStore.get(sessionId);
  if (!entry) {
    entry = {
      sessionId,
      timestamps: [],
      destructiveTimestamps: [],
    };
    rateLimitStore.set(sessionId, entry);
  }

  entry.timestamps.push(now);

  if (isDestructive) {
    entry.destructiveTimestamps.push(now);
  }

  logger.debug('[RateLimiter] Recorded command', {
    sessionId,
    isDestructive,
    totalInWindow: entry.timestamps.length,
    destructiveInWindow: entry.destructiveTimestamps.length,
  });
}

/**
 * Get rate limit status for a session
 */
export function getRateLimitStatus(sessionId: string): {
  commandsInWindow: number;
  maxCommands: number;
  destructiveInWindow: number;
  maxDestructive: number;
  remainingCommands: number;
  remainingDestructive: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(sessionId);

  if (!entry) {
    return {
      commandsInWindow: 0,
      maxCommands: MAX_COMMANDS_PER_MINUTE,
      destructiveInWindow: 0,
      maxDestructive: MAX_DESTRUCTIVE_PER_HOUR,
      remainingCommands: MAX_COMMANDS_PER_MINUTE,
      remainingDestructive: MAX_DESTRUCTIVE_PER_HOUR,
    };
  }

  // Clean and count
  const commandsInWindow = entry.timestamps.filter((ts) => now - ts < WINDOW_MS).length;
  const destructiveInWindow = entry.destructiveTimestamps.filter(
    (ts) => now - ts < DESTRUCTIVE_WINDOW_MS
  ).length;

  return {
    commandsInWindow,
    maxCommands: MAX_COMMANDS_PER_MINUTE,
    destructiveInWindow,
    maxDestructive: MAX_DESTRUCTIVE_PER_HOUR,
    remainingCommands: Math.max(0, MAX_COMMANDS_PER_MINUTE - commandsInWindow),
    remainingDestructive: Math.max(0, MAX_DESTRUCTIVE_PER_HOUR - destructiveInWindow),
  };
}

/**
 * Reset rate limits for a session (for testing)
 */
export function resetRateLimit(sessionId: string): void {
  rateLimitStore.delete(sessionId);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Cleanup expired entries (run periodically)
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, entry] of rateLimitStore.entries()) {
    // If all timestamps are expired, remove the entry
    const hasRecentCommands = entry.timestamps.some((ts) => now - ts < WINDOW_MS);
    const hasRecentDestructive = entry.destructiveTimestamps.some(
      (ts) => now - ts < DESTRUCTIVE_WINDOW_MS
    );

    if (!hasRecentCommands && !hasRecentDestructive) {
      rateLimitStore.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug('[RateLimiter] Cleaned up expired entries', { count: cleaned });
  }

  return cleaned;
}

// Cleanup task: Run every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}
