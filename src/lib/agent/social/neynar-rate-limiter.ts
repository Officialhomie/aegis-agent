/**
 * Neynar Rate Limiter - Monthly quota management for Farcaster posting
 *
 * Ensures Aegis stays within Neynar free tier (1000 posts/month) by:
 * - Tracking usage by category (proof, stats, health, emergency)
 * - Priority tiers (emergency bypasses, stats/health prioritized)
 * - Monthly reset on 1st of each month
 * - Redis-backed persistent state
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';

/** Neynar free tier monthly limit */
const MONTHLY_QUOTA = 1000;

/** Budget allocation per category (emergency is unlimited) */
const CATEGORY_BUDGETS: Record<PostCategory, number> = {
  proof: 740,      // Sponsorship proofs (1 per 40-45 sponsorships)
  stats: 30,       // Daily stats (1/day)
  health: 180,     // Health updates (every 4 hours)
  emergency: 50,   // Reserved for critical alerts
};

export type PostCategory = 'proof' | 'stats' | 'health' | 'emergency';

interface RateLimiterState {
  month: string; // Format: YYYY-MM
  used: Record<PostCategory, number>;
  total: number;
  lastReset: string; // ISO timestamp
}

const STATE_KEY = 'neynar:monthly:usage';

/**
 * Neynar Rate Limiter - Token bucket with monthly quota
 */
export class NeynarRateLimiter {
  private state: RateLimiterState | null = null;

  constructor() {}

  /**
   * Initialize rate limiter state from Redis
   */
  private async loadState(): Promise<RateLimiterState> {
    if (this.state) return this.state;

    const store = await getStateStore();
    const data = await store.get(STATE_KEY);

    const currentMonth = this.getCurrentMonth();

    if (!data) {
      // Initialize new state
      return this.resetState(currentMonth);
    }

    try {
      const parsed = JSON.parse(data) as RateLimiterState;

      // Check if month has changed (auto-reset)
      if (parsed.month !== currentMonth) {
        logger.info('[Neynar] Month changed, resetting rate limiter', {
          oldMonth: parsed.month,
          newMonth: currentMonth,
          previousTotal: parsed.total,
        });
        return this.resetState(currentMonth);
      }

      this.state = parsed;
      return parsed;
    } catch {
      return this.resetState(currentMonth);
    }
  }

  /**
   * Reset state for new month
   */
  private resetState(month: string): RateLimiterState {
    this.state = {
      month,
      used: {
        proof: 0,
        stats: 0,
        health: 0,
        emergency: 0,
      },
      total: 0,
      lastReset: new Date().toISOString(),
    };
    return this.state;
  }

  /**
   * Save state to Redis
   */
  private async saveState(state: RateLimiterState): Promise<void> {
    const store = await getStateStore();
    await store.set(STATE_KEY, JSON.stringify(state));
    this.state = state;
  }

  /**
   * Get current month in YYYY-MM format
   */
  private getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Check if we can post in this category
   */
  async canPost(category: PostCategory): Promise<boolean> {
    const state = await this.loadState();

    // Emergency posts always allowed (bypass rate limits)
    if (category === 'emergency') {
      return true;
    }

    // Check category-specific budget
    const budget = CATEGORY_BUDGETS[category];
    const used = state.used[category];

    if (used >= budget) {
      logger.warn('[Neynar] Category budget exceeded', {
        category,
        used,
        budget,
        month: state.month,
      });
      return false;
    }

    // Check total monthly quota
    if (state.total >= MONTHLY_QUOTA) {
      logger.warn('[Neynar] Monthly quota exceeded', {
        total: state.total,
        quota: MONTHLY_QUOTA,
        month: state.month,
      });
      return false;
    }

    return true;
  }

  /**
   * Consume a token (increment usage)
   */
  async consumeToken(category: PostCategory): Promise<void> {
    const state = await this.loadState();

    // Increment category usage
    state.used[category] = (state.used[category] || 0) + 1;

    // Increment total
    state.total += 1;

    await this.saveState(state);

    logger.debug('[Neynar] Token consumed', {
      category,
      categoryUsed: state.used[category],
      categoryBudget: CATEGORY_BUDGETS[category],
      totalUsed: state.total,
      totalQuota: MONTHLY_QUOTA,
      month: state.month,
    });

    // Alert if approaching limits
    if (state.total >= MONTHLY_QUOTA * 0.9) {
      logger.warn('[Neynar] Approaching monthly quota', {
        used: state.total,
        quota: MONTHLY_QUOTA,
        remaining: MONTHLY_QUOTA - state.total,
      });
    }
  }

  /**
   * Get current usage stats
   */
  async getUsageStats(): Promise<{
    month: string;
    total: number;
    quota: number;
    remaining: number;
    byCategory: Record<PostCategory, { used: number; budget: number; remaining: number }>;
  }> {
    const state = await this.loadState();

    return {
      month: state.month,
      total: state.total,
      quota: MONTHLY_QUOTA,
      remaining: MONTHLY_QUOTA - state.total,
      byCategory: {
        proof: {
          used: state.used.proof,
          budget: CATEGORY_BUDGETS.proof,
          remaining: CATEGORY_BUDGETS.proof - state.used.proof,
        },
        stats: {
          used: state.used.stats,
          budget: CATEGORY_BUDGETS.stats,
          remaining: CATEGORY_BUDGETS.stats - state.used.stats,
        },
        health: {
          used: state.used.health,
          budget: CATEGORY_BUDGETS.health,
          remaining: CATEGORY_BUDGETS.health - state.used.health,
        },
        emergency: {
          used: state.used.emergency,
          budget: CATEGORY_BUDGETS.emergency,
          remaining: CATEGORY_BUDGETS.emergency - state.used.emergency,
        },
      },
    };
  }

  /**
   * Reset usage (for testing or manual override)
   */
  async reset(): Promise<void> {
    const currentMonth = this.getCurrentMonth();
    const state = this.resetState(currentMonth);
    await this.saveState(state);
    logger.info('[Neynar] Rate limiter manually reset', { month: currentMonth });
  }
}

/** Singleton instance */
let rateLimiterInstance: NeynarRateLimiter | null = null;

/**
 * Get or create Neynar rate limiter instance
 */
export async function getNeynarRateLimiter(): Promise<NeynarRateLimiter> {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new NeynarRateLimiter();
  }
  return rateLimiterInstance;
}
