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
