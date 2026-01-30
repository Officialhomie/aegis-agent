/**
 * Circuit breaker to prevent repeated execution failures from overwhelming the system.
 * Opens after threshold failures within the window; resets on success or after cooldown.
 */

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

export class CircuitBreaker {
  private state: State = 'CLOSED';
  private failures = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
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

  /** Execute fn only if circuit allows; records success/failure based on result */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransition();

    if (this.state === 'OPEN') {
      throw new Error(
        `Circuit breaker OPEN - too many failures (${this.failures}). Wait ${this.options.cooldownMs}ms before retry.`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
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

let defaultBreaker: CircuitBreaker | null = null;

export function getDefaultCircuitBreaker(): CircuitBreaker {
  if (!defaultBreaker) {
    defaultBreaker = new CircuitBreaker();
  }
  return defaultBreaker;
}
