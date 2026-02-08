/**
 * Economic Circuit Breaker for Aegis Agent
 *
 * Prevents economic losses by monitoring:
 * - Gas prices (halt when > 5 Gwei)
 * - Reserve runway (halt when < 24 hours)
 * - Budget utilization (alert when > 80%)
 *
 * Uses hysteresis to prevent oscillation:
 * - Opens at 5 Gwei, closes at 3 Gwei
 * - Uses 5-minute moving average
 *
 * Designed for 1000 txs/day scale with proactive protection.
 */

import { logger } from '../../../logger';
import { getStateStore } from '../../state-store';

export interface EconomicBreakerConfig {
  /** Maximum gas price in Gwei before opening breaker */
  maxGasPriceGwei: number;
  /** Minimum runway in hours before opening breaker */
  minRunwayHours: number;
  /** Minimum ETH reserve before opening breaker */
  minReserveETH: number;
  /** Minimum USDC reserve before opening breaker */
  minReserveUSDC: number;
  /** Maximum budget utilization percentage (0-100) */
  maxBudgetUtilizationPct: number;
  /** Gas price hysteresis - closes when gas drops to this level */
  gasPriceCloseThresholdGwei: number;
  /** Moving average window for gas price (milliseconds) */
  gasPriceWindowMs: number;
}

export interface EconomicBreakerState {
  /** Is breaker currently open (blocking operations) */
  isOpen: boolean;
  /** Reason for opening (if open) */
  openReason?: string;
  /** Timestamp when breaker opened */
  openedAt?: number;
  /** Gas price samples for moving average */
  gasPriceSamples: Array<{ timestamp: number; priceGwei: number }>;
  /** Last calculated runway hours */
  lastRunwayHours?: number;
  /** Last checked timestamp */
  lastCheckAt: number;
}

export interface RunwayEstimate {
  currentReservesETH: number;
  currentReservesUSDC: number;
  burnRateETHPerHour: number;
  burnRateUSDCPerHour: number;
  estimatedRunwayHours: number;
  confidence: 'high' | 'medium' | 'low';
}

const DEFAULT_CONFIG: EconomicBreakerConfig = {
  maxGasPriceGwei: parseFloat(process.env.ECONOMIC_BREAKER_MAX_GAS_GWEI || '5'),
  minRunwayHours: parseFloat(process.env.ECONOMIC_BREAKER_MIN_RUNWAY_HOURS || '24'),
  minReserveETH: parseFloat(process.env.ECONOMIC_BREAKER_MIN_RESERVE_ETH || '0.1'),
  minReserveUSDC: parseFloat(process.env.ECONOMIC_BREAKER_MIN_RESERVE_USDC || '100'),
  maxBudgetUtilizationPct: parseFloat(process.env.ECONOMIC_BREAKER_MAX_BUDGET_PCT || '90'),
  gasPriceCloseThresholdGwei: 3, // Hysteresis: opens at 5, closes at 3
  gasPriceWindowMs: 5 * 60 * 1000, // 5 minutes
};

export class EconomicCircuitBreaker {
  private config: EconomicBreakerConfig;
  private state: EconomicBreakerState;
  private stateKey = 'economic-breaker:state';

  constructor(config: Partial<EconomicBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isOpen: false,
      gasPriceSamples: [],
      lastCheckAt: Date.now(),
    };
  }

  /**
   * Check economic conditions and update breaker state.
   *
   * @param context Current economic context
   * @returns Breaker state and health status
   */
  async check(context: {
    currentGasPriceGwei?: number;
    reservesETH?: number;
    reservesUSDC?: number;
    estimatedRunwayHours?: number;
    protocolBudgets?: Array<{ balanceUSD: number; dailyBurnRateUSD: number }>;
  }): Promise<{
    healthy: boolean;
    reason?: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Load persisted state
    await this.loadState();

    // Check 1: Gas Price with Moving Average and Hysteresis
    if (context.currentGasPriceGwei !== undefined) {
      const gasPriceCheck = this.checkGasPrice(context.currentGasPriceGwei);
      if (!gasPriceCheck.healthy) {
        if (!this.state.isOpen) {
          this.open(`Gas price exceeded threshold: ${context.currentGasPriceGwei.toFixed(2)} Gwei`);
        }
        await this.saveState();
        return {
          healthy: false,
          reason: gasPriceCheck.reason,
          warnings,
        };
      }
    }

    // Check 2: Reserve Runway
    if (context.estimatedRunwayHours !== undefined) {
      this.state.lastRunwayHours = context.estimatedRunwayHours;

      if (context.estimatedRunwayHours < this.config.minRunwayHours) {
        if (!this.state.isOpen) {
          this.open(
            `Reserve runway below threshold: ${context.estimatedRunwayHours.toFixed(1)}h < ${this.config.minRunwayHours}h`
          );
        }
        await this.saveState();
        return {
          healthy: false,
          reason: `Reserve runway critically low: ${context.estimatedRunwayHours.toFixed(1)} hours remaining`,
          warnings,
        };
      }

      // Warning threshold: 2x minimum runway
      if (context.estimatedRunwayHours < this.config.minRunwayHours * 2) {
        warnings.push(
          `Reserve runway approaching threshold: ${context.estimatedRunwayHours.toFixed(1)}h (threshold: ${this.config.minRunwayHours}h)`
        );
      }
    }

    // Check 3: Minimum Reserves
    if (context.reservesETH !== undefined && context.reservesETH < this.config.minReserveETH) {
      if (!this.state.isOpen) {
        this.open(
          `ETH reserve below minimum: ${context.reservesETH.toFixed(4)} ETH < ${this.config.minReserveETH} ETH`
        );
      }
      await this.saveState();
      return {
        healthy: false,
        reason: `ETH reserve critically low: ${context.reservesETH.toFixed(4)} ETH`,
        warnings,
      };
    }

    if (context.reservesUSDC !== undefined && context.reservesUSDC < this.config.minReserveUSDC) {
      warnings.push(
        `USDC reserve below minimum: ${context.reservesUSDC.toFixed(2)} USDC < ${this.config.minReserveUSDC} USDC`
      );
    }

    // Check 4: Protocol Budget Utilization
    if (context.protocolBudgets && context.protocolBudgets.length > 0) {
      for (const budget of context.protocolBudgets) {
        if (budget.dailyBurnRateUSD > 0) {
          const daysRemaining = budget.balanceUSD / budget.dailyBurnRateUSD;
          const hoursRemaining = daysRemaining * 24;

          if (hoursRemaining < 24) {
            warnings.push(
              `Protocol budget critically low: ${budget.balanceUSD.toFixed(2)} USD (~${hoursRemaining.toFixed(1)}h remaining)`
            );
          }
        }

        // Budget utilization check (if we had initial budget, would check percentage)
        // For now, just warn if balance < $10
        if (budget.balanceUSD < 10) {
          warnings.push(`Protocol budget depleted: ${budget.balanceUSD.toFixed(2)} USD remaining`);
        }
      }
    }

    // If breaker was open and all checks passed, close it
    if (this.state.isOpen) {
      this.close();
    }

    await this.saveState();

    return {
      healthy: true,
      warnings,
    };
  }

  /**
   * Check gas price with moving average and hysteresis.
   */
  private checkGasPrice(currentGasPriceGwei: number): {
    healthy: boolean;
    reason?: string;
  } {
    const now = Date.now();

    // Add sample to window
    this.state.gasPriceSamples.push({
      timestamp: now,
      priceGwei: currentGasPriceGwei,
    });

    // Remove samples outside window
    const windowStart = now - this.config.gasPriceWindowMs;
    this.state.gasPriceSamples = this.state.gasPriceSamples.filter(
      (s) => s.timestamp >= windowStart
    );

    // Calculate moving average
    const avgGasPrice =
      this.state.gasPriceSamples.reduce((sum, s) => sum + s.priceGwei, 0) /
      this.state.gasPriceSamples.length;

    // Hysteresis logic
    if (this.state.isOpen) {
      // Breaker is open - close only when gas drops to close threshold
      if (avgGasPrice <= this.config.gasPriceCloseThresholdGwei) {
        logger.info('[EconomicBreaker] Gas price normalized, closing breaker', {
          avgGasPrice: avgGasPrice.toFixed(2),
          closeThreshold: this.config.gasPriceCloseThresholdGwei,
        });
        return { healthy: true };
      } else {
        return {
          healthy: false,
          reason: `Gas price still high: ${avgGasPrice.toFixed(2)} Gwei (closes at ${this.config.gasPriceCloseThresholdGwei} Gwei)`,
        };
      }
    } else {
      // Breaker is closed - open only when gas exceeds max threshold
      if (avgGasPrice > this.config.maxGasPriceGwei) {
        return {
          healthy: false,
          reason: `Gas price exceeded: ${avgGasPrice.toFixed(2)} Gwei > ${this.config.maxGasPriceGwei} Gwei`,
        };
      }
      return { healthy: true };
    }
  }

  /**
   * Calculate reserve runway based on historical burn rate.
   *
   * @param reservesETH Current ETH reserves
   * @param reservesUSDC Current USDC reserves
   * @param sponsorshipHistory Recent sponsorships for burn rate calculation
   */
  calculateRunway(
    reservesETH: number,
    reservesUSDC: number,
    sponsorshipHistory: Array<{
      timestamp: number;
      gasUsed: bigint;
      gasPriceGwei: number;
    }>
  ): RunwayEstimate {
    // Calculate burn rate from last 24 hours
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recentSponsorships = sponsorshipHistory.filter((s) => s.timestamp >= dayAgo);

    if (recentSponsorships.length === 0) {
      // No data - return conservative estimate
      return {
        currentReservesETH: reservesETH,
        currentReservesUSDC: reservesUSDC,
        burnRateETHPerHour: 0,
        burnRateUSDCPerHour: 0,
        estimatedRunwayHours: Infinity,
        confidence: 'low',
      };
    }

    // Sum up ETH burned
    const totalETHBurned = recentSponsorships.reduce((sum, s) => {
      const ethBurned = (Number(s.gasUsed) * s.gasPriceGwei) / 1e9; // Convert Gwei to ETH
      return sum + ethBurned;
    }, 0);

    const hours = (now - dayAgo) / (60 * 60 * 1000);
    const burnRateETHPerHour = totalETHBurned / hours;
    const burnRateUSDCPerHour = 0; // Not tracking USDC burn yet

    // Calculate runway
    let estimatedRunwayHours = Infinity;
    if (burnRateETHPerHour > 0) {
      estimatedRunwayHours = reservesETH / burnRateETHPerHour;
    }

    // Confidence based on data points
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (recentSponsorships.length >= 50) {
      confidence = 'high';
    } else if (recentSponsorships.length >= 10) {
      confidence = 'medium';
    }

    return {
      currentReservesETH: reservesETH,
      currentReservesUSDC: reservesUSDC,
      burnRateETHPerHour,
      burnRateUSDCPerHour,
      estimatedRunwayHours,
      confidence,
    };
  }

  /**
   * Open the breaker (block operations).
   */
  private open(reason: string): void {
    this.state.isOpen = true;
    this.state.openReason = reason;
    this.state.openedAt = Date.now();

    logger.warn('[EconomicBreaker] BREAKER OPENED - Sponsorships blocked', {
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Close the breaker (resume operations).
   */
  private close(): void {
    const durationMs = this.state.openedAt ? Date.now() - this.state.openedAt : 0;

    logger.info('[EconomicBreaker] BREAKER CLOSED - Resuming operations', {
      previousReason: this.state.openReason,
      durationMs,
      durationMinutes: (durationMs / (60 * 1000)).toFixed(1),
    });

    this.state.isOpen = false;
    this.state.openReason = undefined;
    this.state.openedAt = undefined;
  }

  /**
   * Check if breaker is currently open.
   */
  isOpen(): boolean {
    return this.state.isOpen;
  }

  /**
   * Get current breaker state.
   */
  getState(): EconomicBreakerState {
    return { ...this.state };
  }

  /**
   * Reset breaker state (for testing or manual override).
   */
  reset(): void {
    this.state = {
      isOpen: false,
      gasPriceSamples: [],
      lastCheckAt: Date.now(),
    };
  }

  /**
   * Load breaker state from Redis (for multi-node consistency).
   */
  private async loadState(): Promise<void> {
    try {
      const store = await getStateStore();
      const saved = await store.get(this.stateKey);

      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = {
          ...this.state,
          ...parsed,
          gasPriceSamples: parsed.gasPriceSamples || [],
        };
      }
    } catch (error) {
      logger.warn('[EconomicBreaker] Failed to load state (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save breaker state to Redis (for multi-node consistency).
   */
  private async saveState(): Promise<void> {
    try {
      const store = await getStateStore();
      await store.set(this.stateKey, JSON.stringify(this.state), { px: 60 * 60 * 1000 }); // 1 hour TTL
    } catch (error) {
      logger.warn('[EconomicBreaker] Failed to save state (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if economic breaker is enabled.
   */
  static isEnabled(): boolean {
    return process.env.ECONOMIC_BREAKER_ENABLED !== 'false';
  }
}

// Singleton instance
let economicBreakerInstance: EconomicCircuitBreaker | null = null;

/**
 * Get singleton economic breaker instance.
 */
export function getEconomicBreaker(): EconomicCircuitBreaker {
  if (!economicBreakerInstance) {
    economicBreakerInstance = new EconomicCircuitBreaker();
  }
  return economicBreakerInstance;
}
