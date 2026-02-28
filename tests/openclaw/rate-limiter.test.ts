/**
 * OpenClaw Rate Limiter Tests
 *
 * Tests for the sliding window rate limiting implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  recordCommand,
  getRateLimitStatus,
  RATE_LIMITS,
  clearRateLimits,
} from '../../src/lib/agent/openclaw/rate-limiter';

describe('Rate Limiter', () => {
  const sessionId = 'test-session-123';

  beforeEach(() => {
    clearRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('allows first command', () => {
      const result = checkRateLimit(sessionId, false);
      expect(result.allowed).toBe(true);
    });

    it('allows commands within limit', () => {
      for (let i = 0; i < 10; i++) {
        recordCommand(sessionId, false);
      }

      const result = checkRateLimit(sessionId, false);
      expect(result.allowed).toBe(true);
    });

    it('blocks commands exceeding minute limit', () => {
      for (let i = 0; i < RATE_LIMITS.maxCommandsPerMinute; i++) {
        recordCommand(sessionId, false);
      }

      const result = checkRateLimit(sessionId, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per minute');
    });

    it('blocks destructive commands exceeding hourly limit', () => {
      for (let i = 0; i < RATE_LIMITS.maxDestructivePerHour; i++) {
        recordCommand(sessionId, true);
      }

      const result = checkRateLimit(sessionId, true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Destructive');
    });

    it('resets after time window passes', () => {
      for (let i = 0; i < RATE_LIMITS.maxCommandsPerMinute; i++) {
        recordCommand(sessionId, false);
      }

      // Blocked initially
      expect(checkRateLimit(sessionId, false).allowed).toBe(false);

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      expect(checkRateLimit(sessionId, false).allowed).toBe(true);
    });
  });

  describe('recordCommand', () => {
    it('records regular commands', () => {
      recordCommand(sessionId, false);
      const status = getRateLimitStatus(sessionId);
      expect(status.commandsInWindow).toBe(1);
    });

    it('records destructive commands separately', () => {
      recordCommand(sessionId, true);
      const status = getRateLimitStatus(sessionId);
      expect(status.commandsInWindow).toBe(1);
      expect(status.destructiveInWindow).toBe(1);
    });

    it('tracks multiple commands', () => {
      recordCommand(sessionId, false);
      recordCommand(sessionId, false);
      recordCommand(sessionId, false);
      const status = getRateLimitStatus(sessionId);
      expect(status.commandsInWindow).toBe(3);
    });
  });

  describe('getRateLimitStatus', () => {
    it('returns empty status for new session', () => {
      const status = getRateLimitStatus('new-session');
      expect(status.commandsInWindow).toBe(0);
      expect(status.destructiveInWindow).toBe(0);
      expect(status.remainingCommands).toBe(RATE_LIMITS.maxCommandsPerMinute);
      expect(status.remainingDestructive).toBe(RATE_LIMITS.maxDestructivePerHour);
    });

    it('calculates remaining commands correctly', () => {
      for (let i = 0; i < 10; i++) {
        recordCommand(sessionId, false);
      }

      const status = getRateLimitStatus(sessionId);
      expect(status.commandsInWindow).toBe(10);
      expect(status.remainingCommands).toBe(RATE_LIMITS.maxCommandsPerMinute - 10);
    });

    it('expires old entries', () => {
      recordCommand(sessionId, false);

      // Advance time by 2 minutes
      vi.advanceTimersByTime(120000);

      const status = getRateLimitStatus(sessionId);
      expect(status.commandsInWindow).toBe(0);
    });
  });

  describe('multiple sessions', () => {
    it('tracks sessions independently', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      for (let i = 0; i < 5; i++) {
        recordCommand(session1, false);
      }
      for (let i = 0; i < 3; i++) {
        recordCommand(session2, false);
      }

      expect(getRateLimitStatus(session1).commandsInWindow).toBe(5);
      expect(getRateLimitStatus(session2).commandsInWindow).toBe(3);
    });
  });
});
