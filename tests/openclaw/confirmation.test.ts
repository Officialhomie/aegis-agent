/**
 * OpenClaw Confirmation Flow Tests
 *
 * Tests for the confirmation system for destructive operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createConfirmation,
  verifyConfirmation,
  cancelConfirmation,
  hasPendingConfirmation,
  getPendingConfirmation,
  clearAllConfirmations,
} from '../../src/lib/agent/openclaw/confirmation';

describe('Confirmation Flow', () => {
  const sessionId = 'test-session-123';

  beforeEach(() => {
    clearAllConfirmations();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createConfirmation', () => {
    it('creates a confirmation token', () => {
      const result = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(6); // 3 bytes = 6 hex chars
      expect(result.action).toBe('delete_agent');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('generates unique tokens', () => {
      const result1 = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });
      clearAllConfirmations();
      const result2 = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      expect(result1.token).not.toBe(result2.token);
    });

    it('YES confirms the most recent action', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });
      createConfirmation({
        action: 'revoke_delegation',
        args: { delegationId: 'clm123' },
        sessionId,
        description: 'Revoke delegation clm123',
      });

      // YES confirms the most recent (second) action
      const result = verifyConfirmation(sessionId, 'YES');
      expect(result.valid).toBe(true);
      expect(result.confirmation?.action).toBe('revoke_delegation');
    });
  });

  describe('verifyConfirmation', () => {
    it('validates correct token', () => {
      const confirmation = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const result = verifyConfirmation(sessionId, confirmation.token);

      expect(result.valid).toBe(true);
      expect(result.confirmation?.action).toBe('delete_agent');
    });

    it('rejects incorrect token', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const result = verifyConfirmation(sessionId, 'WRONG1');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('rejects expired token', () => {
      const confirmation = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      const result = verifyConfirmation(sessionId, confirmation.token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects when no confirmation exists', () => {
      const result = verifyConfirmation('unknown-session', 'ANYTKN');

      expect(result.valid).toBe(false);
    });

    it('consumes token after successful verification', () => {
      const confirmation = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      // First verification succeeds
      expect(verifyConfirmation(sessionId, confirmation.token).valid).toBe(true);

      // Second verification fails (token consumed)
      expect(verifyConfirmation(sessionId, confirmation.token).valid).toBe(false);
    });

    it('accepts YES keyword', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const result = verifyConfirmation(sessionId, 'YES');

      expect(result.valid).toBe(true);
    });

    it('accepts CONFIRM keyword', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const result = verifyConfirmation(sessionId, 'CONFIRM');

      expect(result.valid).toBe(true);
    });
  });

  describe('cancelConfirmation', () => {
    it('cancels pending confirmation', () => {
      const confirmation = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const cancelled = cancelConfirmation(sessionId);

      expect(cancelled).toBe(true);
      expect(verifyConfirmation(sessionId, confirmation.token).valid).toBe(false);
      expect(hasPendingConfirmation(sessionId)).toBe(false);
    });

    it('returns false if no confirmation exists', () => {
      const cancelled = cancelConfirmation('unknown-session');
      expect(cancelled).toBe(false);
    });
  });

  describe('hasPendingConfirmation', () => {
    it('returns true when confirmation exists', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      expect(hasPendingConfirmation(sessionId)).toBe(true);
    });

    it('returns false when no confirmation exists', () => {
      expect(hasPendingConfirmation('unknown-session')).toBe(false);
    });

    it('returns false when confirmation is expired', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      expect(hasPendingConfirmation(sessionId)).toBe(false);
    });
  });

  describe('getPendingConfirmation', () => {
    it('returns confirmation details', () => {
      const confirmation = createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      const pending = getPendingConfirmation(sessionId);

      expect(pending).not.toBeNull();
      expect(pending?.token).toBe(confirmation.token);
      expect(pending?.action).toBe('delete_agent');
    });

    it('returns null when no confirmation exists', () => {
      expect(getPendingConfirmation('unknown-session')).toBeNull();
    });

    it('returns null when confirmation is expired', () => {
      createConfirmation({
        action: 'delete_agent',
        args: { agentAddress: '0x1234' },
        sessionId,
        description: 'Delete agent 0x1234',
      });

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      expect(getPendingConfirmation(sessionId)).toBeNull();
    });
  });
});
