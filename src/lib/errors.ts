/**
 * Custom errors for Aegis agent.
 * These errors should be thrown (not swallowed) for fail-closed behavior.
 */

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    Object.setPrototypeOf(this, DatabaseUnavailableError.prototype);
  }
}

export class ObservationFailedError extends Error {
  public readonly observationType: string;
  public readonly cause?: Error;

  constructor(message: string, opts?: { observationType?: string; cause?: Error }) {
    super(message);
    this.name = 'ObservationFailedError';
    this.observationType = opts?.observationType ?? 'unknown';
    this.cause = opts?.cause;
    Object.setPrototypeOf(this, ObservationFailedError.prototype);
  }
}

export class CriticalConfigMissingError extends Error {
  public readonly configKey: string;

  constructor(message: string, configKey?: string) {
    super(message);
    this.name = 'CriticalConfigMissingError';
    this.configKey = configKey ?? 'unknown';
    Object.setPrototypeOf(this, CriticalConfigMissingError.prototype);
  }
}

export class BundlerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundlerUnavailableError';
    Object.setPrototypeOf(this, BundlerUnavailableError.prototype);
  }
}

export class GasPriceObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GasPriceObservationError';
    Object.setPrototypeOf(this, GasPriceObservationError.prototype);
  }
}

export class BalanceObservationError extends Error {
  public readonly address: string;
  public readonly chainId?: number;

  constructor(message: string, opts?: { address?: string; chainId?: number }) {
    super(message);
    this.name = 'BalanceObservationError';
    this.address = opts?.address ?? 'unknown';
    this.chainId = opts?.chainId;
    Object.setPrototypeOf(this, BalanceObservationError.prototype);
  }
}

export class OraclePriceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OraclePriceUnavailableError';
    Object.setPrototypeOf(this, OraclePriceUnavailableError.prototype);
  }
}

export class CircuitBreakerPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerPersistenceError';
    Object.setPrototypeOf(this, CircuitBreakerPersistenceError.prototype);
  }
}

export class BudgetDeductionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetDeductionFailedError';
    Object.setPrototypeOf(this, BudgetDeductionFailedError.prototype);
  }
}

export class ReasoningFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReasoningFailedError';
    Object.setPrototypeOf(this, ReasoningFailedError.prototype);
  }
}
