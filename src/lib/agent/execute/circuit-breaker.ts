/**
 * Circuit breaker to prevent repeated execution failures from overwhelming the system.
 * Opens after threshold failures within the window; resets on success or after cooldown.
 * When REDIS_URL is set, state is persisted to Redis.
 * Optional health check (reserves) for paymaster loop.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { getAgentWalletBalance } from '../observe/sponsorship';

const RESERVE_CRITICAL_ETH = Number(process.env.RESERVE_CRITICAL_ETH) || 0.05;

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

  /** Optional: check health before execution (reserves, etc.). Returns { healthy: true } or { healthy: false, reason }. */
  async checkHealthBeforeExecution(): Promise<{ healthy: boolean; reason?: string }> {
    const reserves = await getAgentWalletBalance();
    if (reserves.ETH < RESERVE_CRITICAL_ETH) {
      return { healthy: false, reason: 'Reserve below critical threshold' };
    }
    if (this.getState() === 'OPEN') {
      return { healthy: false, reason: 'Circuit breaker OPEN' };
    }
    return { healthy: true };
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
