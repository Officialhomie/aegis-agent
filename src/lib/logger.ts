/**
 * Structured logger for Aegis agent.
 * Use instead of console.log/error/warn for consistent levels and optional correlation IDs.
 */

const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const LEVEL_ORDER: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: string): boolean {
  const current = LEVEL_ORDER[LOG_LEVEL] ?? 1;
  const messageLevel = LEVEL_ORDER[level] ?? 1;
  return messageLevel >= current;
}

function formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, meta));
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) console.info(formatMessage('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
};

export function withCorrelationId(id: string): typeof logger {
  return {
    debug: (msg, meta) => logger.debug(msg, { ...meta, correlationId: id }),
    info: (msg, meta) => logger.info(msg, { ...meta, correlationId: id }),
    warn: (msg, meta) => logger.warn(msg, { ...meta, correlationId: id }),
    error: (msg, meta) => logger.error(msg, { ...meta, correlationId: id }),
  };
}
