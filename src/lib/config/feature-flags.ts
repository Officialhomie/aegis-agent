/**
 * Feature Flags Configuration
 *
 * Controls feature rollout for OpenClaw expanded commands and other features.
 * All flags default to OFF (false) for safety.
 */

/**
 * OpenClaw Expanded Commands
 * Enables CRUD operations for agents, protocols, guarantees, delegations,
 * heartbeat monitoring, reports, and safety features.
 */
export const OPENCLAW_EXPANDED = process.env.OPENCLAW_EXPANDED === 'true';

/**
 * Heartbeat Worker
 * Enables the background heartbeat worker for agent liveness monitoring.
 */
export const HEARTBEAT_ENABLED = process.env.HEARTBEAT_ENABLED === 'true';

/**
 * Heartbeat check interval (how often the worker checks for due heartbeats)
 * Default: 60000ms (1 minute)
 */
export const HEARTBEAT_CHECK_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_CHECK_INTERVAL_MS ?? '60000',
  10
);

/**
 * Default heartbeat interval for new schedules
 * Default: 900000ms (15 minutes)
 */
export const HEARTBEAT_DEFAULT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_DEFAULT_INTERVAL_MS ?? '900000',
  10
);

/**
 * OpenClaw Rate Limiting
 * Maximum commands per minute per session
 */
export const OPENCLAW_RATE_LIMIT_PER_MINUTE = parseInt(
  process.env.OPENCLAW_RATE_LIMIT_PER_MINUTE ?? '60',
  10
);

/**
 * OpenClaw Destructive Command Rate Limiting
 * Maximum destructive commands (delete, revoke, disable) per hour per session
 */
export const OPENCLAW_DESTRUCTIVE_LIMIT_PER_HOUR = parseInt(
  process.env.OPENCLAW_DESTRUCTIVE_LIMIT_PER_HOUR ?? '5',
  10
);

/**
 * Confirmation timeout for destructive operations (ms)
 * Default: 60000ms (1 minute)
 */
export const OPENCLAW_CONFIRMATION_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_CONFIRMATION_TIMEOUT_MS ?? '60000',
  10
);

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: string): boolean {
  switch (flag) {
    case 'OPENCLAW_EXPANDED':
      return OPENCLAW_EXPANDED;
    case 'HEARTBEAT_ENABLED':
      return HEARTBEAT_ENABLED;
    default:
      return false;
  }
}

/**
 * Get all feature flag values (for debugging/status)
 */
export function getAllFeatureFlags(): Record<string, boolean | number> {
  return {
    OPENCLAW_EXPANDED,
    HEARTBEAT_ENABLED,
    HEARTBEAT_CHECK_INTERVAL_MS,
    HEARTBEAT_DEFAULT_INTERVAL_MS,
    OPENCLAW_RATE_LIMIT_PER_MINUTE,
    OPENCLAW_DESTRUCTIVE_LIMIT_PER_HOUR,
    OPENCLAW_CONFIRMATION_TIMEOUT_MS,
  };
}
