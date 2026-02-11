/**
 * Config utilities for validated environment variable loading.
 * Use getConfigNumber for numeric env vars with defaults and optional min/max clamping.
 * Use getConfigString for string env vars with defaults.
 */

import { logger } from './logger';

/**
 * Parse a string environment variable with a default value.
 * Logs when using default.
 */
export function getConfigString(key: string, defaultValue: string): string {
  const raw = process.env[key];

  if (!raw || raw.trim() === '') {
    logger.debug(`[Config] ${key} not set, using default`, { defaultValue });
    return defaultValue;
  }

  return raw.trim();
}

/**
 * Parse a numeric environment variable with optional min/max clamping.
 * Logs when using default, when clamping, or when value is invalid.
 */
export function getConfigNumber(
  key: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const raw = process.env[key];

  if (!raw || raw.trim() === '') {
    logger.debug(`[Config] ${key} not set, using default`, { defaultValue });
    return defaultValue;
  }

  const parsed = Number(raw);

  if (Number.isNaN(parsed)) {
    logger.warn(`[Config] ${key} is not a valid number, using default`, {
      raw,
      defaultValue,
    });
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    logger.warn(`[Config] ${key} below minimum, clamping`, {
      value: parsed,
      min,
      clamped: min,
    });
    return min;
  }

  if (max !== undefined && parsed > max) {
    logger.warn(`[Config] ${key} above maximum, clamping`, {
      value: parsed,
      max,
      clamped: max,
    });
    return max;
  }

  return parsed;
}
