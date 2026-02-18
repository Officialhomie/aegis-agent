/**
 * Proactive reporter — pushes autonomous Aegis actions to the user via OpenClaw.
 *
 * When Aegis sponsors a transaction or replenishes reserves autonomously,
 * this module POSTs a summary to any registered OpenClaw callback URLs so
 * the user receives a message on their WhatsApp/Telegram/Signal.
 *
 * Rate limited to 1 proactive message per 5 minutes per session
 * to avoid flooding the messaging channel.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { appendActionLog } from './memory-manager';

const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const CALLBACK_TTL_S = 3600; // 1 hour
const CALLBACK_KEY_PREFIX = 'aegis:openclaw:callback:';
const RATE_KEY_PREFIX = 'aegis:openclaw:rate:';

/**
 * Register a callback URL for a session (called when OpenClaw sends a request).
 */
export async function registerCallbackUrl(sessionId: string, callbackUrl: string): Promise<void> {
  const store = await getStateStore();
  await store.set(`${CALLBACK_KEY_PREFIX}${sessionId}`, callbackUrl, {
    px: CALLBACK_TTL_S * 1000,
  });
}

/**
 * Send a proactive notification to all active OpenClaw sessions.
 * Called by MultiModeAgent after a successful autonomous action.
 */
export async function reportToActiveSessions(message: string): Promise<void> {
  const store = await getStateStore();

  // Collect known session callback URLs
  // In a real implementation, use a list/set. Here we use a single "latest session" key.
  const latestCallback = await store.get('aegis:openclaw:latest-callback');
  if (!latestCallback) return;

  const parts = latestCallback.split('|');
  const [sessionId, callbackUrl] = parts;
  if (!sessionId || !callbackUrl) return;

  // Rate limit: don't spam the user
  const rateKey = `${RATE_KEY_PREFIX}${sessionId}`;
  const rateLimitSet = await store.setNX(rateKey, '1', { px: RATE_LIMIT_MS });
  if (!rateLimitSet) {
    // Already sent a proactive message recently for this session
    return;
  }

  try {
    const body = JSON.stringify({ agent: 'aegis', message, timestamp: new Date().toISOString() });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('[ProactiveReporter] Callback returned non-200', {
        sessionId,
        status: res.status,
      });
    }

    await appendActionLog('PROACTIVE', `Notified session ${sessionId}: ${message.slice(0, 80)}`);
  } catch (err) {
    logger.warn('[ProactiveReporter] Failed to call back OpenClaw', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Store the latest session + callback URL for proactive reporting.
 * Called once per command that includes a callbackUrl.
 */
export async function setLatestSession(sessionId: string, callbackUrl: string): Promise<void> {
  const store = await getStateStore();
  await store.set('aegis:openclaw:latest-callback', `${sessionId}|${callbackUrl}`, {
    px: CALLBACK_TTL_S * 1000,
  });
}
