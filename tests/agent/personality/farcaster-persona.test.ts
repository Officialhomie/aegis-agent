/**
 * Farcaster Persona - unit tests
 * Tests hashtags, emojis, fun facts probability, constants.
 */

import { describe, it, expect } from 'vitest';
import {
  FARCASTER_HASHTAGS,
  EMOJI_CATEGORIES,
  FUN_FACTS,
  getRandomHashtags,
  getContextualEmoji,
  maybeGetFunFact,
  FARCASTER_SYSTEM_PROMPT,
  POST_TEMPLATES,
} from '../../../src/lib/agent/personality/farcaster-persona';

describe('farcaster-persona', () => {
  describe('FARCASTER_HASHTAGS', () => {
    it('has exactly 10 items', () => {
      expect(FARCASTER_HASHTAGS).toHaveLength(10);
    });
    it('all items start with #', () => {
      FARCASTER_HASHTAGS.forEach((tag) => {
        expect(tag.startsWith('#')).toBe(true);
      });
    });
  });

  describe('EMOJI_CATEGORIES', () => {
    it('has keys activity, milestones, reserves, protocols, transparency', () => {
      expect(Object.keys(EMOJI_CATEGORIES).sort()).toEqual([
        'activity',
        'milestones',
        'protocols',
        'reserves',
        'transparency',
      ]);
    });
    it('each category has >= 3 emojis', () => {
      (Object.keys(EMOJI_CATEGORIES) as (keyof typeof EMOJI_CATEGORIES)[]).forEach(
        (key) => {
          expect(EMOJI_CATEGORIES[key].length).toBeGreaterThanOrEqual(3);
        }
      );
    });
  });

  describe('FUN_FACTS', () => {
    it('has 8 items', () => {
      expect(FUN_FACTS).toHaveLength(8);
    });
  });

  describe('getRandomHashtags', () => {
    it('getRandomHashtags(3) returns 3 unique hashtags from the pool', () => {
      const tags = getRandomHashtags(3);
      expect(tags).toHaveLength(3);
      expect(new Set(tags).size).toBe(3);
      tags.forEach((tag) => {
        expect(FARCASTER_HASHTAGS).toContain(tag);
      });
    });
    it('getRandomHashtags(1) returns 1 hashtag', () => {
      const tags = getRandomHashtags(1);
      expect(tags).toHaveLength(1);
      expect(FARCASTER_HASHTAGS).toContain(tags[0]);
    });
    it('getRandomHashtags(5) returns 5 hashtags', () => {
      const tags = getRandomHashtags(5);
      expect(tags).toHaveLength(5);
      expect(new Set(tags).size).toBe(5);
    });
    it('getRandomHashtags() defaults to 3', () => {
      const tags = getRandomHashtags();
      expect(tags).toHaveLength(3);
    });
  });

  describe('getContextualEmoji', () => {
    it("getContextualEmoji('activity') returns one of the activity emojis", () => {
      const emoji = getContextualEmoji('activity');
      expect(EMOJI_CATEGORIES.activity).toContain(emoji);
    });
    it('works for every category key', () => {
      (Object.keys(EMOJI_CATEGORIES) as (keyof typeof EMOJI_CATEGORIES)[]).forEach(
        (category) => {
          const emoji = getContextualEmoji(category);
          expect(EMOJI_CATEGORIES[category]).toContain(emoji);
        }
      );
    });
  });

  describe('maybeGetFunFact', () => {
    it('returns string or null; run 200x expect some non-null and some null (~10% probability)', () => {
      let nullCount = 0;
      let nonNullCount = 0;
      for (let i = 0; i < 200; i++) {
        const result = maybeGetFunFact();
        if (result === null) nullCount++;
        else {
          nonNullCount++;
          expect(typeof result).toBe('string');
          expect(FUN_FACTS).toContain(result);
        }
      }
      expect(nonNullCount).toBeGreaterThan(0);
      expect(nullCount).toBeGreaterThan(0);
    });
  });

  describe('FARCASTER_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof FARCASTER_SYSTEM_PROMPT).toBe('string');
      expect(FARCASTER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });
  });

  describe('POST_TEMPLATES', () => {
    it('has keys activity, milestone, reserves, protocol', () => {
      expect(Object.keys(POST_TEMPLATES).sort()).toEqual([
        'activity',
        'milestone',
        'protocol',
        'reserves',
      ]);
    });
    it('each key has array with length >= 2', () => {
      (Object.keys(POST_TEMPLATES) as (keyof typeof POST_TEMPLATES)[]).forEach(
        (key) => {
          expect(Array.isArray(POST_TEMPLATES[key])).toBe(true);
          expect((POST_TEMPLATES[key] as readonly string[]).length).toBeGreaterThanOrEqual(2);
        }
      );
    });
  });
});
