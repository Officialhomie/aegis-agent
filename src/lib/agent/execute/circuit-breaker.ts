/**
 * Circuit breaker to prevent repeated execution failures from overwhelming the system.
 * Opens after threshold failures within the window; resets on success or after cooldown.
 * When REDIS_URL is set, state is persisted to Redis.
 * Optional health check (reserves) for paymaster loop.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { getAgentWalletBalance } from '../observe/sponsorship';
import { checkBundlerHealth } from './bundler-client';
import { getEconomicBreaker } from './circuit-breaker/economic-breaker';

const RESERVE_CRITICAL_ETH = Number(process.env.RESERVE_CRITICAL_ETH) || 0.05;
const BUNDLER_HEALTH_CHECK_ENABLED = process.env.BUNDLER_HEALTH_CHECK_ENABLED !== 'false';

const CIRCUIT_BREAKER_KEY_PREFIX = 'aegis:circuit_breaker';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold?: number;
  /** Time window in ms for counting failures */
  windowMs?: number;
  /** Cooldown in ms before allowing half-open (retry) */
  cooldownMs?: number;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface PersistedState {
  state: State;
  failures: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export class CircuitBreaker {
  private state: State = 'CLOSED';
  private failures = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private readonly options: Required<CircuitBreakerOptions>;
  /** Instance key for isolated persistence (Redis key suffix) */
  private readonly key: string;

  constructor(options: CircuitBreakerOptions & { key?: string } = {}) {
    const { key = 'default', ...opts } = options;
    this.key = key;
    this.options = { ...DEFAULTS, ...opts };
  }

  private get storeKey(): string {
    return `${CIRCUIT_BREAKER_KEY_PREFIX}:${this.key}`;
  }

  getState(): State {
    this.maybeTransition();
    return this.state;
  }

  /** Record a successful execution (resets failure count when CLOSED) */
  recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
    }
  }

  /** Record a failed execution */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    }
  }

  private getPersistedState(): PersistedState {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  private applyPersistedState(data: PersistedState): void {
    this.state = data.state;
    this.failures = data.failures;
    this.lastFailureTime = data.lastFailureTime;
    this.lastSuccessTime = data.lastSuccessTime;
  }

  private async loadFromStore(): Promise<void> {
    try {
      const store = await getStateStore();
      const raw = await store.get(this.storeKey);
      if (!raw) {
        logger.debug('[CircuitBreaker] No persisted state found, starting fresh');
        return;
      }
      const data = JSON.parse(raw) as PersistedState;
      if (data.state && typeof data.failures === 'number') {
        this.applyPersistedState(data);
        logger.info('[CircuitBreaker] Restored persisted state', {
          state: data.state,
          failures: data.failures,
        });
      }
    } catch (error) {
      logger.error('[CircuitBreaker] Failed to load persisted state - starting in CLOSED state', {
        error,
        severity: 'CRITICAL',
        impact: 'Circuit breaker state lost - safety mechanism weakened',
      });
    }
  }

  private async saveToStore(): Promise<void> {
    try {
      const store = await getStateStore();
      await store.set(this.storeKey, JSON.stringify(this.getPersistedState()));
      logger.debug('[CircuitBreaker] State persisted successfully');
    } catch (error) {
      logger.error('[CircuitBreaker] FAILED to persist state - circuit breaker state will be lost on restart', {
        error,
        currentState: this.state,
        failures: this.failures,
        severity: 'CRITICAL',
        actionNeeded: 'Check Redis/state store connection',
      });
    }
  }

  /**
   * Check health before execution (reserves, bundler, circuit state, economic conditions).
   * Returns { healthy: true } or { healthy: false, reason }.
   */
  async checkHealthBeforeExecution(): Promise<{
    healthy: boolean;
    reason?: string;
    details?: {
      reserveHealth: boolean;
      bundlerHealth: boolean;
      circuitState: State;
      economicHealth: boolean;
    };
    warnings?: string[];
  }> {
    const details = {
      reserveHealth: true,
      bundlerHealth: true,
      circuitState: this.getState(),
      economicHealth: true,
    };
    const warnings: string[] = [];

    // Check circuit breaker state first
    if (details.circuitState === 'OPEN') {
      return {
        healthy: false,
        reason: 'Circuit breaker OPEN',
        details,
      };
    }

    // Check reserve balance
    const reserves = await getAgentWalletBalance();
    if (reserves.ETH < RESERVE_CRITICAL_ETH) {
      details.reserveHealth = false;
      return {
        healthy: false,
        reason: `Reserve below critical threshold (${reserves.ETH} ETH < ${RESERVE_CRITICAL_ETH} ETH)`,
        details,
      };
    }

    // Check bundler health if enabled
    if (BUNDLER_HEALTH_CHECK_ENABLED) {
      const bundlerStatus = await checkBundlerHealth();
      if (!bundlerStatus.available) {
        details.bundlerHealth = false;
        logger.warn('[CircuitBreaker] Bundler health check failed', {
          error: bundlerStatus.error,
          latencyMs: bundlerStatus.latencyMs,
        });
        return {
          healthy: false,
          reason: `Bundler unavailable: ${bundlerStatus.error}`,
          details,
        };
      }

      // Log if bundler latency is high
      if (bundlerStatus.latencyMs && bundlerStatus.latencyMs > 5000) {
        logger.warn('[CircuitBreaker] Bundler latency is high', {
          latencyMs: bundlerStatus.latencyMs,
        });
      }
    }

    // Check economic conditions (gas price, runway, protocol budgets)
    try {
      const economicBreaker = getEconomicBreaker();
      const economicCheck = await economicBreaker.check({
        reservesETH: reserves.ETH,
        reservesUSDC: reserves.USDC,
      });

      if (!economicCheck.healthy) {
        details.economicHealth = false;
        logger.warn('[CircuitBreaker] Economic health check failed', {
          reason: economicCheck.reason,
          warnings: economicCheck.warnings,
        });
        return {
          healthy: false,
          reason: economicCheck.reason ?? 'Economic conditions unfavorable',
          details,
          warnings: economicCheck.warnings,
        };
      }

      // Accumulate economic warnings even if healthy
      if (economicCheck.warnings.length > 0) {
        warnings.push(...economicCheck.warnings);
        logger.info('[CircuitBreaker] Economic warnings detected', {
          warnings: economicCheck.warnings,
        });
      }
    } catch (error) {
      logger.error('[CircuitBreaker] Economic health check error - degrading gracefully', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'HIGH',
      });
      // Don't fail execution if economic check fails - degrade gracefully
      warnings.push('Economic health check unavailable');
    }

    return { healthy: true, details, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Check bundler health specifically.
   * Use when you need to verify bundler availability without full health check.
   */
  async checkBundlerAvailability(): Promise<{
    available: boolean;
    error?: string;
    latencyMs?: number;
  }> {
    if (!BUNDLER_HEALTH_CHECK_ENABLED) {
      return { available: true };
    }
    return checkBundlerHealth();
  }

  /** Execute fn only if circuit allows; records success/failure based on result. Persists state when REDIS_URL is set. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.loadFromStore();
    this.maybeTransition();

    if (this.state === 'OPEN') {
      throw new Error(
        `Circuit breaker OPEN - too many failures (${this.failures}). Wait ${this.options.cooldownMs}ms before retry.`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      await this.saveToStore();
      return result;
    } catch (error) {
      this.recordFailure();
      await this.saveToStore();
      throw error;
    }
  }

  private maybeTransition(): void {
    const now = Date.now();

    if (this.state === 'OPEN' && this.lastFailureTime !== null) {
      if (now - this.lastFailureTime >= this.options.cooldownMs) {
        this.state = 'HALF_OPEN';
      }
    }

    if (this.state === 'CLOSED' && this.failures >= this.options.failureThreshold) {
      if (this.lastFailureTime !== null && now - this.lastFailureTime <= this.options.windowMs) {
        this.state = 'OPEN';
      } else {
        this.failures = 0;
      }
    }
  }
}

const breakers = new Map<string, CircuitBreaker>();

/**
 * Get a circuit breaker instance by key. Each key has an isolated state (including Redis persistence).
 * Use different keys per mode (e.g. 'reserve-pipeline', 'gas-sponsorship') for isolation.
 */
export function getCircuitBreaker(
  key: string = 'default',
  options?: CircuitBreakerOptions
): CircuitBreaker {
  if (!breakers.has(key)) {
    breakers.set(key, new CircuitBreaker({ ...options, key }));
  }
  return breakers.get(key)!;
}

/** @deprecated Use getCircuitBreaker('default') or getCircuitBreaker(mode) for isolation */
export function getDefaultCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker('default');
}
