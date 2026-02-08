/**
 * Temperature Manager - unit tests
 * Tests temperature map, action mapping, pattern matching, validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  getContextualTemperature,
  isValidTemperature,
  getTemperatureDescription,
  getContextFromAction,
  getRecommendedTemperature,
} from '../../../src/lib/agent/reason/temperature-manager';

describe('temperature-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContextualTemperature', () => {
    it('returns 0.2 for financial', () => {
      expect(getContextualTemperature('financial')).toBe(0.2);
    });
    it('returns 0.8 for social', () => {
      expect(getContextualTemperature('social')).toBe(0.8);
    });
    it('returns 0.7 for engagement', () => {
      expect(getContextualTemperature('engagement')).toBe(0.7);
    });
    it('returns 0.5 for alert', () => {
      expect(getContextualTemperature('alert')).toBe(0.5);
    });
  });

  describe('isValidTemperature', () => {
    it('returns true for 0, 0.5, 1', () => {
      expect(isValidTemperature(0)).toBe(true);
      expect(isValidTemperature(0.5)).toBe(true);
      expect(isValidTemperature(1)).toBe(true);
    });
    it('returns false for -0.1, 1.1, NaN', () => {
      expect(isValidTemperature(-0.1)).toBe(false);
      expect(isValidTemperature(1.1)).toBe(false);
      expect(isValidTemperature(NaN)).toBe(false);
    });
  });

  describe('getTemperatureDescription', () => {
    it('returns correct description for each context', () => {
      expect(getTemperatureDescription('financial')).toContain('Deterministic');
      expect(getTemperatureDescription('social')).toContain('Creative');
      expect(getTemperatureDescription('engagement')).toContain('Conversational');
      expect(getTemperatureDescription('alert')).toContain('Clear');
    });
  });

  describe('getContextFromAction', () => {
    it('maps SPONSOR_TRANSACTION, SWAP_RESERVES, WAIT to financial', () => {
      expect(getContextFromAction('SPONSOR_TRANSACTION')).toBe('financial');
      expect(getContextFromAction('SWAP_RESERVES')).toBe('financial');
      expect(getContextFromAction('WAIT')).toBe('financial');
    });
    it('maps FARCASTER_POST to social', () => {
      expect(getContextFromAction('FARCASTER_POST')).toBe('social');
    });
    it('maps MOLTBOOK_REPLY to engagement', () => {
      expect(getContextFromAction('MOLTBOOK_REPLY')).toBe('engagement');
    });
    it('maps ALERT_PROTOCOL and EMERGENCY_ALERT to alert', () => {
      expect(getContextFromAction('ALERT_PROTOCOL')).toBe('alert');
      expect(getContextFromAction('EMERGENCY_ALERT')).toBe('alert');
    });
    it('defaults unknown action to financial', () => {
      expect(getContextFromAction('UNKNOWN_ACTION' as any)).toBe('financial');
    });
  });

  describe('getRecommendedTemperature', () => {
    it('returns 0.2 financial for sponsor gas', () => {
      const r = getRecommendedTemperature('sponsor gas');
      expect(r.temperature).toBe(0.2);
      expect(r.context).toBe('financial');
    });
    it('returns 0.8 social for farcaster post', () => {
      const r = getRecommendedTemperature('farcaster post');
      expect(r.temperature).toBe(0.8);
      expect(r.context).toBe('social');
    });
    it('returns 0.7 engagement for moltbook reply', () => {
      const r = getRecommendedTemperature('moltbook reply');
      expect(r.temperature).toBe(0.7);
      expect(r.context).toBe('engagement');
    });
    it('returns 0.5 alert for emergency alert', () => {
      const r = getRecommendedTemperature('emergency alert');
      expect(r.temperature).toBe(0.5);
      expect(r.context).toBe('alert');
    });
    it('defaults unknown use case to 0.2 financial', () => {
      const r = getRecommendedTemperature('unknown thing');
      expect(r.temperature).toBe(0.2);
      expect(r.context).toBe('financial');
    });
  });

  describe('temperature isolation', () => {
    it('financial actions never return temperature > 0.2', () => {
      expect(getContextualTemperature('financial')).toBeLessThanOrEqual(0.2);
      expect(getContextFromAction('SPONSOR_TRANSACTION')).toBe('financial');
      expect(getContextualTemperature(getContextFromAction('SPONSOR_TRANSACTION'))).toBe(0.2);
      expect(getContextualTemperature(getContextFromAction('SWAP_RESERVES'))).toBe(0.2);
      expect(getContextualTemperature(getContextFromAction('WAIT'))).toBe(0.2);
    });
  });
});
