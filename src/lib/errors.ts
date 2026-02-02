/**
 * Custom errors for Aegis agent.
 */

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    Object.setPrototypeOf(this, DatabaseUnavailableError.prototype);
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
