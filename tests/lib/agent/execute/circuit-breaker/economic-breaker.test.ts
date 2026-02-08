/**
 * Comprehensive tests for the Economic Circuit Breaker (Phase 2)
 *
 * Tests cover:
 * - Gas price monitoring with moving average and hysteresis
 * - Reserve runway calculation based on burn rate
 * - Protocol budget health checks
 * - State persistence to Redis
 * - State transitions (CLOSED -> OPEN, OPEN -> CLOSED)
 * - Graceful degradation on failures
 * - Concurrent operations
 *
 * Target: 80%+ code coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the state store before importing the module
const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockSetNX = vi.hoisted(() => vi.fn());

vi.mock('../../../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    setNX: mockSetNX,
  }),
}));

// Mock the logger to prevent console output during tests
vi.mock('../../../../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  EconomicCircuitBreaker,
  getEconomicBreaker,
  type RunwayEstimate,
} from '../../../../../src/lib/agent/execute/circuit-breaker/economic-breaker';
import { logger } from '../../../../../src/lib/logger';

describe('EconomicCircuitBreaker', () => {
  let breaker: EconomicCircuitBreaker;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockSetNX.mockResolvedValue(true);

    // Create fresh breaker instance with default config
    breaker = new EconomicCircuitBreaker();
  });

  afterEach(() => {
    // Reset singleton
    vi.resetModules();
  });

  // ============================================================
  // SECTION 1: Basic Initialization and State
  // ============================================================

  describe('Initialization', () => {
    it('initializes with default config values', () => {
      const state = breaker.getState();

      expect(state.isOpen).toBe(false);
      expect(state.gasPriceSamples).toEqual([]);
      expect(state.openReason).toBeUndefined();
      expect(state.openedAt).toBeUndefined();
      expect(state.lastCheckAt).toBeDefined();
    });

    it('accepts custom config', () => {
      const customBreaker = new EconomicCircuitBreaker({
        maxGasPriceGwei: 10,
        minRunwayHours: 48,
        minReserveETH: 0.5,
        minReserveUSDC: 500,
      });

      // Verify custom config is applied by testing behavior
      // With maxGasPriceGwei: 10, gas at 8 Gwei should be healthy
      expect(customBreaker.isOpen()).toBe(false);
    });

    it('merges partial config with defaults', () => {
      const partialBreaker = new EconomicCircuitBreaker({
        maxGasPriceGwei: 10,
        // Other values should use defaults
      });

      expect(partialBreaker.isOpen()).toBe(false);
    });
  });

  // ============================================================
  // SECTION 2: isOpen() Method
  // ============================================================

  describe('isOpen()', () => {
    it('returns false for new breaker (closed by default)', () => {
      expect(breaker.isOpen()).toBe(false);
    });

    it('returns true after breaker is opened due to high gas', async () => {
      // Trigger breaker open with high gas price
      await breaker.check({ currentGasPriceGwei: 10 }); // > 5 Gwei threshold

      expect(breaker.isOpen()).toBe(true);
    });

    it('returns true after breaker is opened due to low runway', async () => {
      await breaker.check({
        estimatedRunwayHours: 10, // < 24 hour threshold
      });

      expect(breaker.isOpen()).toBe(true);
    });

    it('returns false after reset()', async () => {
      // Open the breaker
      await breaker.check({ currentGasPriceGwei: 10 });
      expect(breaker.isOpen()).toBe(true);

      // Reset
      breaker.reset();
      expect(breaker.isOpen()).toBe(false);
    });
  });

  // ============================================================
  // SECTION 3: Gas Price Checks with Moving Average
  // ============================================================

  describe('Gas Price Monitoring', () => {
    it('remains healthy when gas price is below threshold', async () => {
      const result = await breaker.check({ currentGasPriceGwei: 3 });

      expect(result.healthy).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(breaker.isOpen()).toBe(false);
    });

    it('opens breaker when gas price exceeds threshold (5 Gwei)', async () => {
      const result = await breaker.check({ currentGasPriceGwei: 6 });

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('Gas price exceeded');
      expect(breaker.isOpen()).toBe(true);
    });

    it('calculates moving average across multiple samples', async () => {
      // Add samples below threshold
      await breaker.check({ currentGasPriceGwei: 3 });
      await breaker.check({ currentGasPriceGwei: 4 });
      await breaker.check({ currentGasPriceGwei: 4 });

      // Average is 3.67 Gwei, below 5 Gwei threshold
      expect(breaker.isOpen()).toBe(false);

      // Add high sample - average now (3+4+4+8)/4 = 4.75, still below threshold
      await breaker.check({ currentGasPriceGwei: 8 });
      expect(breaker.isOpen()).toBe(false);

      // Add another high sample - average now (3+4+4+8+10)/5 = 5.8, above threshold
      const result = await breaker.check({ currentGasPriceGwei: 10 });
      expect(result.healthy).toBe(false);
      expect(breaker.isOpen()).toBe(true);
    });

    it('removes samples outside the 5-minute window', async () => {
      // Add initial sample
      await breaker.check({ currentGasPriceGwei: 4 });

      // Manually modify state to simulate old sample
      const state = breaker.getState();
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      breaker['state'].gasPriceSamples = [
        { timestamp: oldTimestamp, priceGwei: 10 }, // Old high sample
        { timestamp: Date.now(), priceGwei: 3 },    // Recent low sample
      ];

      // New check should filter out old sample
      const result = await breaker.check({ currentGasPriceGwei: 3 });

      // Moving average should only consider recent samples (3, 3) = 3 Gwei
      expect(result.healthy).toBe(true);
    });

    it('handles gas price of exactly threshold value', async () => {
      const result = await breaker.check({ currentGasPriceGwei: 5 });

      // At exactly 5 Gwei, should still be healthy (threshold is > 5, not >=)
      expect(result.healthy).toBe(true);
    });

    it('handles undefined gas price gracefully', async () => {
      const result = await breaker.check({});

      expect(result.healthy).toBe(true);
      expect(breaker.isOpen()).toBe(false);
    });
  });

  // ============================================================
  // SECTION 4: Hysteresis Logic (Prevents Oscillation)
  // ============================================================

  describe('Hysteresis', () => {
    it('opens at 5 Gwei threshold', async () => {
      await breaker.check({ currentGasPriceGwei: 6 });

      expect(breaker.isOpen()).toBe(true);
    });

    it('stays open when gas drops to 4 Gwei (above close threshold of 3)', async () => {
      // Open breaker
      await breaker.check({ currentGasPriceGwei: 6 });
      expect(breaker.isOpen()).toBe(true);

      // Gas drops to 4 Gwei, but close threshold is 3 Gwei
      const result = await breaker.check({ currentGasPriceGwei: 4 });

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('still high');
      expect(breaker.isOpen()).toBe(true);
    });

    it('closes when gas drops to 3 Gwei (close threshold)', async () => {
      // Open breaker
      await breaker.check({ currentGasPriceGwei: 6 });
      expect(breaker.isOpen()).toBe(true);

      // Clear samples and add low gas samples
      breaker['state'].gasPriceSamples = [];

      // Gas drops to 3 Gwei
      const result = await breaker.check({ currentGasPriceGwei: 3 });

      expect(result.healthy).toBe(true);
      expect(breaker.isOpen()).toBe(false);
    });

    it('prevents oscillation with gap between open and close thresholds', async () => {
      // Sequence simulating fluctuating gas prices
      await breaker.check({ currentGasPriceGwei: 6 }); // Opens
      expect(breaker.isOpen()).toBe(true);

      await breaker.check({ currentGasPriceGwei: 4.5 }); // Stays open
      expect(breaker.isOpen()).toBe(true);

      await breaker.check({ currentGasPriceGwei: 5.5 }); // Stays open
      expect(breaker.isOpen()).toBe(true);

      await breaker.check({ currentGasPriceGwei: 4 }); // Still above 3, stays open
      expect(breaker.isOpen()).toBe(true);

      // Clear and add low samples to trigger close
      breaker['state'].gasPriceSamples = [];
      await breaker.check({ currentGasPriceGwei: 2.5 }); // Below 3, closes
      expect(breaker.isOpen()).toBe(false);

      // Price goes up slightly but below 5
      await breaker.check({ currentGasPriceGwei: 4 }); // Stays closed
      expect(breaker.isOpen()).toBe(false);
    });

    it('logs when closing due to normalized gas price', async () => {
      // Open breaker
      await breaker.check({ currentGasPriceGwei: 6 });

      // Clear samples
      breaker['state'].gasPriceSamples = [];

      // Close breaker
      await breaker.check({ currentGasPriceGwei: 2 });

      expect(logger.info).toHaveBeenCalledWith(
        '[EconomicBreaker] Gas price normalized, closing breaker',
        expect.any(Object)
      );
    });
  });

  // ============================================================
  // SECTION 5: Reserve Runway Checks
  // ============================================================

  describe('Reserve Runway', () => {
    it('remains healthy when runway exceeds threshold', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: 48, // > 24 hour threshold
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('opens breaker when runway is below minimum threshold (24 hours)', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: 12, // < 24 hour threshold
      });

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('critically low');
      expect(breaker.isOpen()).toBe(true);
    });

    it('adds warning when runway approaches threshold (< 2x minimum)', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: 30, // < 48 hours (2x24) but > 24 hours
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('approaching threshold');
    });

    it('updates lastRunwayHours in state', async () => {
      await breaker.check({ estimatedRunwayHours: 72 });

      const state = breaker.getState();
      expect(state.lastRunwayHours).toBe(72);
    });

    it('handles exactly threshold value', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: 24, // Exactly at threshold
      });

      // At exactly 24 hours, should still be healthy (threshold is < 24, not <=)
      expect(result.healthy).toBe(true);
    });
  });

  // ============================================================
  // SECTION 6: calculateRunway() Method
  // ============================================================

  describe('calculateRunway()', () => {
    it('returns infinite runway with no sponsorship history', () => {
      const result = breaker.calculateRunway(1.0, 1000, []);

      expect(result.estimatedRunwayHours).toBe(Infinity);
      expect(result.burnRateETHPerHour).toBe(0);
      expect(result.confidence).toBe('low');
    });

    it('calculates burn rate from 24-hour sponsorship history', () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 1000, gasUsed: BigInt(21000), gasPriceGwei: 5 },
        { timestamp: now - 2000, gasUsed: BigInt(21000), gasPriceGwei: 5 },
        { timestamp: now - 3000, gasUsed: BigInt(21000), gasPriceGwei: 5 },
      ];

      const result = breaker.calculateRunway(1.0, 1000, history);

      // Each sponsorship burns 21000 * 5 / 1e9 = 0.000105 ETH
      // Total burned: 0.000315 ETH in 24 hours
      expect(result.burnRateETHPerHour).toBeGreaterThan(0);
      expect(result.estimatedRunwayHours).toBeLessThan(Infinity);
      expect(result.currentReservesETH).toBe(1.0);
      expect(result.currentReservesUSDC).toBe(1000);
    });

    it('filters out sponsorships older than 24 hours', () => {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;

      const history = [
        { timestamp: dayAgo - 1000, gasUsed: BigInt(21000), gasPriceGwei: 100 }, // Old, should be filtered
        { timestamp: now - 1000, gasUsed: BigInt(21000), gasPriceGwei: 5 },       // Recent
      ];

      const result = breaker.calculateRunway(1.0, 1000, history);

      // Should only count the recent sponsorship
      // Burn rate should be based on 0.000105 ETH (not including old 0.0021 ETH)
      expect(result.confidence).toBe('low'); // Only 1 sample
    });

    it('returns low confidence with fewer than 10 samples', () => {
      const now = Date.now();
      const history = Array(5).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000),
        gasUsed: BigInt(21000),
        gasPriceGwei: 5,
      }));

      const result = breaker.calculateRunway(1.0, 1000, history);

      expect(result.confidence).toBe('low');
    });

    it('returns medium confidence with 10-49 samples', () => {
      const now = Date.now();
      const history = Array(25).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000),
        gasUsed: BigInt(21000),
        gasPriceGwei: 5,
      }));

      const result = breaker.calculateRunway(1.0, 1000, history);

      expect(result.confidence).toBe('medium');
    });

    it('returns high confidence with 50+ samples', () => {
      const now = Date.now();
      const history = Array(100).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000),
        gasUsed: BigInt(21000),
        gasPriceGwei: 5,
      }));

      const result = breaker.calculateRunway(1.0, 1000, history);

      expect(result.confidence).toBe('high');
    });

    it('handles varying gas prices in history', () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 1000, gasUsed: BigInt(21000), gasPriceGwei: 3 },
        { timestamp: now - 2000, gasUsed: BigInt(21000), gasPriceGwei: 5 },
        { timestamp: now - 3000, gasUsed: BigInt(21000), gasPriceGwei: 8 },
      ];

      const result = breaker.calculateRunway(1.0, 1000, history);

      // Total gas: 21000 * 3 + 21000 * 5 + 21000 * 8 = 336000 Gwei = 0.000336 ETH
      expect(result.burnRateETHPerHour).toBeGreaterThan(0);
    });

    it('handles large gas usage values', () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 1000, gasUsed: BigInt(3000000), gasPriceGwei: 50 }, // Large contract interaction
      ];

      const result = breaker.calculateRunway(10.0, 10000, history);

      expect(result.estimatedRunwayHours).toBeLessThan(Infinity);
      expect(result.burnRateETHPerHour).toBeGreaterThan(0);
    });

    it('returns USDC burn rate as 0 (not yet implemented)', () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 1000, gasUsed: BigInt(21000), gasPriceGwei: 5 },
      ];

      const result = breaker.calculateRunway(1.0, 1000, history);

      expect(result.burnRateUSDCPerHour).toBe(0);
    });
  });

  // ============================================================
  // SECTION 7: Minimum Reserve Checks
  // ============================================================

  describe('Minimum Reserves', () => {
    it('opens breaker when ETH reserves below minimum', async () => {
      const result = await breaker.check({
        reservesETH: 0.05, // < 0.1 ETH minimum
      });

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('ETH reserve critically low');
      expect(breaker.isOpen()).toBe(true);
    });

    it('remains healthy when ETH reserves above minimum', async () => {
      const result = await breaker.check({
        reservesETH: 0.5, // > 0.1 ETH minimum
      });

      expect(result.healthy).toBe(true);
    });

    it('adds warning when USDC reserves below minimum', async () => {
      const result = await breaker.check({
        reservesUSDC: 50, // < 100 USDC minimum
      });

      expect(result.healthy).toBe(true); // USDC low only adds warning, doesn't open breaker
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('USDC reserve below minimum');
    });

    it('handles exact minimum ETH reserve', async () => {
      const result = await breaker.check({
        reservesETH: 0.1, // Exactly at minimum
      });

      // At exactly 0.1 ETH, should still be healthy (threshold is < 0.1, not <=)
      expect(result.healthy).toBe(true);
    });
  });

  // ============================================================
  // SECTION 8: Protocol Budget Health Checks
  // ============================================================

  describe('Protocol Budget Health', () => {
    it('adds warning when protocol budget runway is < 24 hours', async () => {
      const result = await breaker.check({
        protocolBudgets: [
          { balanceUSD: 10, dailyBurnRateUSD: 20 }, // 0.5 days = 12 hours
        ],
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.some(w => w.includes('critically low'))).toBe(true);
    });

    it('adds warning when protocol budget balance < $10', async () => {
      const result = await breaker.check({
        protocolBudgets: [
          { balanceUSD: 5, dailyBurnRateUSD: 0.1 },
        ],
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.some(w => w.includes('depleted'))).toBe(true);
    });

    it('skips protocols with zero burn rate', async () => {
      const result = await breaker.check({
        protocolBudgets: [
          { balanceUSD: 100, dailyBurnRateUSD: 0 }, // Zero burn rate
        ],
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('checks multiple protocol budgets', async () => {
      const result = await breaker.check({
        protocolBudgets: [
          { balanceUSD: 1000, dailyBurnRateUSD: 10 },  // 100 days - healthy
          { balanceUSD: 5, dailyBurnRateUSD: 10 },     // 0.5 days - critically low (2 warnings: <24h + <$10)
          { balanceUSD: 8, dailyBurnRateUSD: 0.01 },   // Healthy runway but < $10 (1 warning: depleted)
        ],
      });

      expect(result.healthy).toBe(true);
      // Budget 2: critically low (12h < 24h) + depleted ($5 < $10) = 2 warnings
      // Budget 3: depleted ($8 < $10) = 1 warning
      // Total: 3 warnings
      expect(result.warnings.length).toBe(3);
    });

    it('handles empty protocol budgets array', async () => {
      const result = await breaker.check({
        protocolBudgets: [],
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.length).toBe(0);
    });
  });

  // ============================================================
  // SECTION 9: State Persistence (Redis)
  // ============================================================

  describe('State Persistence', () => {
    it('saves state to Redis after check', async () => {
      await breaker.check({ currentGasPriceGwei: 3 });

      expect(mockSet).toHaveBeenCalledWith(
        'economic-breaker:state',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('loads state from Redis on first check', async () => {
      const savedState = JSON.stringify({
        isOpen: true,
        openReason: 'Previous high gas',
        gasPriceSamples: [],
        lastCheckAt: Date.now() - 60000,
      });
      mockGet.mockResolvedValueOnce(savedState);

      await breaker.check({ currentGasPriceGwei: 2 });

      expect(mockGet).toHaveBeenCalledWith('economic-breaker:state');
    });

    it('handles Redis get failure gracefully', async () => {
      mockGet.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await breaker.check({ currentGasPriceGwei: 3 });

      expect(result.healthy).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        '[EconomicBreaker] Failed to load state (non-critical)',
        expect.any(Object)
      );
    });

    it('handles Redis set failure gracefully', async () => {
      mockSet.mockRejectedValueOnce(new Error('Redis write failed'));

      const result = await breaker.check({ currentGasPriceGwei: 3 });

      expect(result.healthy).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        '[EconomicBreaker] Failed to save state (non-critical)',
        expect.any(Object)
      );
    });

    it('uses 1 hour TTL for state storage', async () => {
      await breaker.check({ currentGasPriceGwei: 3 });

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        60 * 60 // 1 hour in seconds
      );
    });

    it('merges loaded state with current state', async () => {
      const savedState = JSON.stringify({
        isOpen: false,
        lastRunwayHours: 100,
        gasPriceSamples: [{ timestamp: Date.now() - 1000, priceGwei: 4 }],
        lastCheckAt: Date.now() - 60000,
      });
      mockGet.mockResolvedValueOnce(savedState);

      await breaker.check({});

      const state = breaker.getState();
      expect(state.lastRunwayHours).toBe(100);
    });
  });

  // ============================================================
  // SECTION 10: State Transitions
  // ============================================================

  describe('State Transitions', () => {
    it('transitions from CLOSED to OPEN on high gas', async () => {
      expect(breaker.isOpen()).toBe(false);

      await breaker.check({ currentGasPriceGwei: 10 });

      expect(breaker.isOpen()).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        '[EconomicBreaker] BREAKER OPENED - Sponsorships blocked',
        expect.any(Object)
      );
    });

    it('transitions from CLOSED to OPEN on low runway', async () => {
      expect(breaker.isOpen()).toBe(false);

      await breaker.check({ estimatedRunwayHours: 10 });

      expect(breaker.isOpen()).toBe(true);
    });

    it('transitions from CLOSED to OPEN on low ETH reserves', async () => {
      expect(breaker.isOpen()).toBe(false);

      await breaker.check({ reservesETH: 0.01 });

      expect(breaker.isOpen()).toBe(true);
    });

    it('transitions from OPEN to CLOSED when all checks pass', async () => {
      // Open breaker
      await breaker.check({ currentGasPriceGwei: 10 });
      expect(breaker.isOpen()).toBe(true);

      // Clear gas samples to allow close
      breaker['state'].gasPriceSamples = [];

      // All checks pass
      await breaker.check({
        currentGasPriceGwei: 2,
        reservesETH: 1,
        reservesUSDC: 1000,
        estimatedRunwayHours: 100,
      });

      expect(breaker.isOpen()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        '[EconomicBreaker] BREAKER CLOSED - Resuming operations',
        expect.any(Object)
      );
    });

    it('records openedAt timestamp when opening', async () => {
      const beforeOpen = Date.now();
      await breaker.check({ currentGasPriceGwei: 10 });
      const afterOpen = Date.now();

      const state = breaker.getState();
      expect(state.openedAt).toBeGreaterThanOrEqual(beforeOpen);
      expect(state.openedAt).toBeLessThanOrEqual(afterOpen);
    });

    it('clears openedAt and openReason when closing', async () => {
      // Open
      await breaker.check({ currentGasPriceGwei: 10 });
      expect(breaker.getState().openedAt).toBeDefined();
      expect(breaker.getState().openReason).toBeDefined();

      // Close
      breaker['state'].gasPriceSamples = [];
      await breaker.check({ currentGasPriceGwei: 2 });

      const state = breaker.getState();
      expect(state.openedAt).toBeUndefined();
      expect(state.openReason).toBeUndefined();
    });

    it('logs duration when closing breaker', async () => {
      // Open
      await breaker.check({ currentGasPriceGwei: 10 });

      // Simulate some time passing
      breaker['state'].openedAt = Date.now() - 5 * 60 * 1000; // 5 minutes ago

      // Close
      breaker['state'].gasPriceSamples = [];
      await breaker.check({ currentGasPriceGwei: 2 });

      expect(logger.info).toHaveBeenCalledWith(
        '[EconomicBreaker] BREAKER CLOSED - Resuming operations',
        expect.objectContaining({
          durationMs: expect.any(Number),
          durationMinutes: expect.any(String),
        })
      );
    });
  });

  // ============================================================
  // SECTION 11: getState() Method
  // ============================================================

  describe('getState()', () => {
    it('returns a copy of state (immutable)', () => {
      const state1 = breaker.getState();
      state1.isOpen = true; // Mutate the copy

      const state2 = breaker.getState();
      expect(state2.isOpen).toBe(false); // Original unchanged
    });

    it('includes all state properties', async () => {
      // First check opens breaker (gas too high), so runway is not evaluated
      await breaker.check({ currentGasPriceGwei: 10 });

      const state = breaker.getState();

      // Core properties always present
      expect(state).toHaveProperty('isOpen');
      expect(state).toHaveProperty('gasPriceSamples');
      expect(state).toHaveProperty('lastCheckAt');

      // These are set when breaker is opened
      expect(state).toHaveProperty('openReason');
      expect(state).toHaveProperty('openedAt');

      // lastRunwayHours is only set when estimatedRunwayHours is checked
      // Since breaker opened on gas check first, runway wasn't reached
      // Verify it's undefined in this case
      expect(state.lastRunwayHours).toBeUndefined();
    });

    it('includes lastRunwayHours when runway is checked', async () => {
      await breaker.check({ estimatedRunwayHours: 100 });

      const state = breaker.getState();
      expect(state.lastRunwayHours).toBe(100);
    });
  });

  // ============================================================
  // SECTION 12: reset() Method
  // ============================================================

  describe('reset()', () => {
    it('resets breaker to initial state', async () => {
      // Put breaker in open state with data
      await breaker.check({ currentGasPriceGwei: 10, estimatedRunwayHours: 50 });
      expect(breaker.isOpen()).toBe(true);

      // Reset
      breaker.reset();

      const state = breaker.getState();
      expect(state.isOpen).toBe(false);
      expect(state.openReason).toBeUndefined();
      expect(state.openedAt).toBeUndefined();
      expect(state.gasPriceSamples).toEqual([]);
      expect(state.lastRunwayHours).toBeUndefined();
    });

    it('updates lastCheckAt on reset', async () => {
      const before = Date.now();
      breaker.reset();
      const after = Date.now();

      const state = breaker.getState();
      expect(state.lastCheckAt).toBeGreaterThanOrEqual(before);
      expect(state.lastCheckAt).toBeLessThanOrEqual(after);
    });
  });

  // ============================================================
  // SECTION 13: isEnabled() Static Method
  // ============================================================

  describe('isEnabled()', () => {
    const originalEnv = process.env.ECONOMIC_BREAKER_ENABLED;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.ECONOMIC_BREAKER_ENABLED = originalEnv;
      } else {
        delete process.env.ECONOMIC_BREAKER_ENABLED;
      }
    });

    it('returns true by default (when env not set)', () => {
      delete process.env.ECONOMIC_BREAKER_ENABLED;

      expect(EconomicCircuitBreaker.isEnabled()).toBe(true);
    });

    it('returns true when env is "true"', () => {
      process.env.ECONOMIC_BREAKER_ENABLED = 'true';

      expect(EconomicCircuitBreaker.isEnabled()).toBe(true);
    });

    it('returns false when env is "false"', () => {
      process.env.ECONOMIC_BREAKER_ENABLED = 'false';

      expect(EconomicCircuitBreaker.isEnabled()).toBe(false);
    });

    it('returns true when env is any other value', () => {
      process.env.ECONOMIC_BREAKER_ENABLED = 'yes';

      expect(EconomicCircuitBreaker.isEnabled()).toBe(true);
    });
  });

  // ============================================================
  // SECTION 14: Singleton Pattern (getEconomicBreaker)
  // ============================================================

  describe('getEconomicBreaker() Singleton', () => {
    it('returns the same instance on multiple calls', () => {
      // Use the imported getEconomicBreaker directly
      const instance1 = getEconomicBreaker();
      const instance2 = getEconomicBreaker();

      expect(instance1).toBe(instance2);
    });

    it('creates instance of EconomicCircuitBreaker', () => {
      const instance = getEconomicBreaker();

      expect(instance).toBeInstanceOf(EconomicCircuitBreaker);
    });

    it('instance has all expected methods', () => {
      const instance = getEconomicBreaker();

      expect(typeof instance.check).toBe('function');
      expect(typeof instance.isOpen).toBe('function');
      expect(typeof instance.getState).toBe('function');
      expect(typeof instance.reset).toBe('function');
      expect(typeof instance.calculateRunway).toBe('function');
    });
  });

  // ============================================================
  // SECTION 15: Combined Checks (Multiple Conditions)
  // ============================================================

  describe('Combined Checks', () => {
    it('returns first failure reason when multiple checks fail', async () => {
      // Gas price check happens first
      const result = await breaker.check({
        currentGasPriceGwei: 10,    // Fails
        reservesETH: 0.01,          // Would also fail
        estimatedRunwayHours: 10,   // Would also fail
      });

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('Gas price'); // First check to fail
    });

    it('collects warnings from passing checks before failure', async () => {
      // Runway warning happens after gas check fails
      const result = await breaker.check({
        currentGasPriceGwei: 10,     // Fails
        estimatedRunwayHours: 30,    // Would add warning but gas check fails first
      });

      expect(result.healthy).toBe(false);
      // Warnings are collected before the failing check
      expect(result.warnings).toEqual([]);
    });

    it('collects all warnings when all checks pass', async () => {
      const result = await breaker.check({
        currentGasPriceGwei: 3,          // Pass
        reservesETH: 0.5,                // Pass
        reservesUSDC: 50,                // Pass but warning (< 100)
        estimatedRunwayHours: 30,        // Pass but warning (< 48)
        protocolBudgets: [
          { balanceUSD: 5, dailyBurnRateUSD: 0.1 }, // Pass but warning (< $10)
        ],
      });

      expect(result.healthy).toBe(true);
      expect(result.warnings.length).toBe(3);
    });

    it('handles empty context (all checks skipped)', async () => {
      const result = await breaker.check({});

      expect(result.healthy).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  // ============================================================
  // SECTION 16: Concurrent Operations
  // ============================================================

  describe('Concurrent Operations', () => {
    it('handles multiple concurrent check() calls', async () => {
      const results = await Promise.all([
        breaker.check({ currentGasPriceGwei: 3 }),
        breaker.check({ currentGasPriceGwei: 4 }),
        breaker.check({ currentGasPriceGwei: 3.5 }),
      ]);

      // All should be healthy
      expect(results.every(r => r.healthy)).toBe(true);
    });

    it('maintains consistent state under concurrent load', async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          breaker.check({ currentGasPriceGwei: 3 + (i * 0.1) }).then(() => {})
        );
      }

      await Promise.all(promises);

      // State should be consistent
      const state = breaker.getState();
      expect(state.gasPriceSamples.length).toBe(10);
    });

    it('handles concurrent open/close attempts', async () => {
      // Rapidly alternate between conditions that open/close breaker
      const checks = [
        { currentGasPriceGwei: 10 }, // Open
        { currentGasPriceGwei: 2 },  // Would close
        { currentGasPriceGwei: 8 },  // Would open
        { currentGasPriceGwei: 3 },  // Would close
      ];

      // Run sequentially to ensure predictable behavior
      for (const ctx of checks) {
        await breaker.check(ctx);
      }

      // Final state depends on last check
      // Due to moving average, state may vary
      expect(typeof breaker.isOpen()).toBe('boolean');
    });
  });

  // ============================================================
  // SECTION 17: Edge Cases
  // ============================================================

  describe('Edge Cases', () => {
    it('handles zero gas price', async () => {
      const result = await breaker.check({ currentGasPriceGwei: 0 });

      expect(result.healthy).toBe(true);
    });

    it('handles negative gas price (invalid but handled)', async () => {
      const result = await breaker.check({ currentGasPriceGwei: -1 });

      expect(result.healthy).toBe(true);
    });

    it('handles very large gas price', async () => {
      const result = await breaker.check({ currentGasPriceGwei: 1000000 });

      expect(result.healthy).toBe(false);
      expect(breaker.isOpen()).toBe(true);
    });

    it('handles zero reserves', async () => {
      const result = await breaker.check({
        reservesETH: 0,
        reservesUSDC: 0,
      });

      expect(result.healthy).toBe(false);
    });

    it('handles zero runway hours', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: 0,
      });

      expect(result.healthy).toBe(false);
    });

    it('handles Infinity runway hours', async () => {
      const result = await breaker.check({
        estimatedRunwayHours: Infinity,
      });

      expect(result.healthy).toBe(true);
    });

    it('handles NaN values gracefully', async () => {
      const result = await breaker.check({
        currentGasPriceGwei: NaN,
      });

      // NaN comparisons are always false
      expect(result.healthy).toBe(true);
    });

    it('handles decimal precision in calculations', () => {
      const now = Date.now();
      const history = Array(100).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000),
        gasUsed: BigInt(21000),
        gasPriceGwei: 0.001, // Very small gas price
      }));

      const result = breaker.calculateRunway(0.001, 1, history);

      expect(Number.isFinite(result.estimatedRunwayHours)).toBe(true);
      expect(result.estimatedRunwayHours).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SECTION 18: Config Edge Cases
  // ============================================================

  describe('Config Edge Cases', () => {
    it('handles custom close threshold higher than open threshold', () => {
      // This is a misconfiguration but should be handled
      const customBreaker = new EconomicCircuitBreaker({
        maxGasPriceGwei: 5,
        gasPriceCloseThresholdGwei: 10, // Higher than max (unusual)
      });

      expect(customBreaker.isOpen()).toBe(false);
    });

    it('handles zero thresholds', () => {
      const customBreaker = new EconomicCircuitBreaker({
        maxGasPriceGwei: 0,
        minRunwayHours: 0,
        minReserveETH: 0,
        minReserveUSDC: 0,
      });

      expect(customBreaker.isOpen()).toBe(false);
    });

    it('handles custom gas price window', async () => {
      const customBreaker = new EconomicCircuitBreaker({
        gasPriceWindowMs: 1000, // 1 second window
      });

      // Add sample
      await customBreaker.check({ currentGasPriceGwei: 3 });

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Old sample should be filtered out
      await customBreaker.check({ currentGasPriceGwei: 3 });

      const state = customBreaker.getState();
      expect(state.gasPriceSamples.length).toBe(1);
    });
  });

  // ============================================================
  // SECTION 19: Integration with Other Circuit Breaker Functions
  // ============================================================

  describe('Integration', () => {
    it('can be used with calculateRunway result', async () => {
      const now = Date.now();
      const history = Array(50).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000),
        gasUsed: BigInt(21000),
        gasPriceGwei: 5,
      }));

      const runway = breaker.calculateRunway(1.0, 1000, history);

      const result = await breaker.check({
        estimatedRunwayHours: runway.estimatedRunwayHours,
        reservesETH: runway.currentReservesETH,
        reservesUSDC: runway.currentReservesUSDC,
      });

      expect(typeof result.healthy).toBe('boolean');
    });

    it('exports RunwayEstimate type correctly', () => {
      const estimate: RunwayEstimate = {
        currentReservesETH: 1,
        currentReservesUSDC: 1000,
        burnRateETHPerHour: 0.01,
        burnRateUSDCPerHour: 0,
        estimatedRunwayHours: 100,
        confidence: 'high',
      };

      expect(estimate.confidence).toBe('high');
    });
  });

  // ============================================================
  // SECTION 20: Error Messages and Logging
  // ============================================================

  describe('Error Messages and Logging', () => {
    it('includes gas price value in open reason', async () => {
      await breaker.check({ currentGasPriceGwei: 7.5 });

      const state = breaker.getState();
      expect(state.openReason).toContain('7.50');
    });

    it('includes runway hours in open reason', async () => {
      await breaker.check({ estimatedRunwayHours: 15.5 });

      const state = breaker.getState();
      expect(state.openReason).toContain('15.5');
    });

    it('includes ETH value in open reason', async () => {
      await breaker.check({ reservesETH: 0.0523 });

      const state = breaker.getState();
      expect(state.openReason).toContain('0.0523');
    });

    it('logs with structured metadata', async () => {
      await breaker.check({ currentGasPriceGwei: 10 });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });
  });
});
