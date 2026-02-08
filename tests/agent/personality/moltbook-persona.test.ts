/**
 * Moltbook Persona - unit tests
 * Tests topics, referrals, code snippets, response frameworks.
 */

import { describe, it, expect } from 'vitest';
import {
  MOLTBOOK_TOPICS,
  MOLTBOOK_SYSTEM_PROMPT,
  isRelevantTopic,
  getAgentReferral,
  getCodeSnippet,
  RESPONSE_FRAMEWORKS,
  AGENT_REFERRALS,
} from '../../../src/lib/agent/personality/moltbook-persona';

describe('moltbook-persona', () => {
  describe('MOLTBOOK_TOPICS', () => {
    it('has 20 items', () => {
      expect(MOLTBOOK_TOPICS).toHaveLength(20);
    });
  });

  describe('MOLTBOOK_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof MOLTBOOK_SYSTEM_PROMPT).toBe('string');
      expect(MOLTBOOK_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });
  });

  describe('isRelevantTopic', () => {
    it("returns true for content containing a topic keyword (e.g. 'How does account abstraction work?')", () => {
      expect(isRelevantTopic('How does account abstraction work?')).toBe(true);
    });
    it("returns false for 'Tell me about weather'", () => {
      expect(isRelevantTopic('Tell me about weather')).toBe(false);
    });
    it('is case-insensitive for lowercase topic keywords (content is lowercased before match)', () => {
      expect(isRelevantTopic('ACCOUNT ABSTRACTION on Base')).toBe(true);
      expect(isRelevantTopic('Gas optimization tips')).toBe(true);
    });
  });

  describe('getAgentReferral', () => {
    it("returns a string mentioning @YieldMaximizer for 'yield farming strategies'", () => {
      const ref = getAgentReferral('yield farming strategies');
      expect(ref).not.toBeNull();
      expect(ref!).toContain('@YieldMaximizer');
    });
    it("returns null for 'ERC-4337 paymaster' (no referral for core topics)", () => {
      expect(getAgentReferral('ERC-4337 paymaster')).toBeNull();
    });
  });

  describe('getCodeSnippet', () => {
    it("getCodeSnippet('paymasterValidation') returns non-empty string with Solidity-like content", () => {
      const snippet = getCodeSnippet('paymasterValidation');
      expect(snippet).not.toBeNull();
      expect(snippet!.length).toBeGreaterThan(0);
      expect(snippet).toMatch(/function|require|calldata|bytes/);
    });
    it("getCodeSnippet('nonexistent') returns null", () => {
      expect(getCodeSnippet('nonexistent' as any)).toBeNull();
    });
  });

  describe('RESPONSE_FRAMEWORKS', () => {
    it('has keys howDoesItWork, implementation, troubleshooting, comparison', () => {
      expect(Object.keys(RESPONSE_FRAMEWORKS).sort()).toEqual([
        'comparison',
        'howDoesItWork',
        'implementation',
        'troubleshooting',
      ]);
    });
    it('each key has array with >= 4 steps', () => {
      (
        Object.keys(RESPONSE_FRAMEWORKS) as (keyof typeof RESPONSE_FRAMEWORKS)[]
      ).forEach((key) => {
        expect(Array.isArray(RESPONSE_FRAMEWORKS[key])).toBe(true);
        expect((RESPONSE_FRAMEWORKS[key] as readonly string[]).length).toBeGreaterThanOrEqual(
          4
        );
      });
    });
  });

  describe('AGENT_REFERRALS', () => {
    it('has >= 5 entries', () => {
      expect(Object.keys(AGENT_REFERRALS).length).toBeGreaterThanOrEqual(5);
    });
  });
});
