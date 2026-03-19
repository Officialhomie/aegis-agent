/**
 * Aegis Agent - Rate Limit Lua Scripts
 *
 * Atomic Redis Lua scripts for sorted-set-based rate limiting.
 * Using sorted sets (ZADD/ZREMRANGEBYSCORE/ZCARD) eliminates the
 * GET-parse-push-SET race condition present in JSON array tracking.
 *
 * Both scripts are designed to be detected by the in-memory StateStore
 * fallback: the record script contains 'ZADD', the check script does not.
 */

/**
 * Check if an action is allowed within the rate limit window (read-only).
 *
 * KEYS[1]  = sorted set key
 * ARGV[1]  = limit (max allowed count in window)
 * ARGV[2]  = window_ms (sliding window in milliseconds)
 * ARGV[3]  = now_ms (current timestamp in milliseconds)
 *
 * Returns: 1 if allowed (under limit), 0 if denied (at or over limit)
 */
export const RATE_LIMIT_CHECK_SCRIPT = `
local now = tonumber(ARGV[3])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local current = redis.call('ZCARD', KEYS[1])
if current >= limit then return 0 end
return 1
`;

/**
 * Atomically record a new event and enforce window cleanup.
 *
 * KEYS[1]  = sorted set key
 * ARGV[1]  = window_ms (sliding window in milliseconds)
 * ARGV[2]  = now_ms (current timestamp in milliseconds)
 * ARGV[3]  = unique_id (unique member for this event, e.g. "now:random")
 *
 * Returns: current count after recording (number)
 */
export const RATE_LIMIT_RECORD_SCRIPT = `
local now = tonumber(ARGV[2])
local window = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window)
return redis.call('ZCARD', KEYS[1])
`;
