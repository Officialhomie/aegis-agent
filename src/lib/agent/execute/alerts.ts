/**
 * Aegis Agent - Alert System
 *
 * Sends ALERT_HUMAN notifications via Slack, email (webhook), or generic webhook.
 * Includes retry with exponential backoff and deduplication of recent alerts.
 */

import { createHash } from 'crypto';
import { logger } from '../../logger';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertPayload {
  severity: AlertSeverity;
  message: string;
  suggestedAction?: string;
  source?: string;
  timestamp?: string;
}

const ALERT_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 min
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/** Recent alert hashes (hash -> time first seen) for deduplication */
const recentAlertHashes = new Map<string, number>();

function alertHash(payload: AlertPayload): string {
  const str = `${payload.severity}:${payload.message}`;
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function isDuplicate(hash: string): boolean {
  const now = Date.now();
  const first = recentAlertHashes.get(hash);
  if (first == null) return false;
  if (now - first > ALERT_DEDUP_WINDOW_MS) {
    recentAlertHashes.delete(hash);
    return false;
  }
  return true;
}

function markSent(hash: string): void {
  if (!recentAlertHashes.has(hash)) {
    recentAlertHashes.set(hash, Date.now());
  }
  // Prune old entries
  const now = Date.now();
  for (const [h, t] of recentAlertHashes.entries()) {
    if (now - t > ALERT_DEDUP_WINDOW_MS) recentAlertHashes.delete(h);
  }
}

function getSlackWebhookUrl(): string | null {
  return process.env.SLACK_WEBHOOK_URL ?? null;
}

function getAlertWebhookUrl(): string | null {
  return process.env.ALERT_WEBHOOK_URL ?? null;
}

function getAlertEmail(): string | null {
  return process.env.ALERT_EMAIL ?? null;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string
): Promise<{ ok: boolean; status?: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (res.ok) return { ok: true };
      if (attempt < MAX_RETRIES && res.status >= 500) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return { ok: false, status: res.status };
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  logger.warn(`[Alerts] ${label} failed after ${MAX_RETRIES + 1} attempts`, {
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });
  return { ok: false };
}

/**
 * Send alert to Slack via incoming webhook (with retry)
 */
async function sendSlackAlert(payload: AlertPayload): Promise<boolean> {
  const url = getSlackWebhookUrl();
  if (!url) return false;

  const emoji = { LOW: ':information_source:', MEDIUM: ':warning:', HIGH: ':rotating_light:', CRITICAL: ':sos:' };
  const text = [
    `*[Aegis] ${payload.severity}*`,
    payload.message,
    payload.suggestedAction ? `_Suggested:_ ${payload.suggestedAction}` : '',
    payload.timestamp ? `_${payload.timestamp}_` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const { ok } = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, icon_emoji: emoji[payload.severity] }),
    },
    'Slack webhook'
  );
  if (ok) logger.info('[Alerts] Slack alert sent', { severity: payload.severity });
  else logger.warn('[Alerts] Slack alert failed', { severity: payload.severity });
  return ok;
}

/**
 * Send alert to generic webhook (with retry)
 */
async function sendWebhookAlert(payload: AlertPayload): Promise<boolean> {
  const url = getAlertWebhookUrl();
  if (!url) return false;

  const body = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    email: getAlertEmail(),
  };

  const { ok } = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Alert webhook'
  );
  if (ok) logger.info('[Alerts] Webhook alert sent', { severity: payload.severity });
  else logger.warn('[Alerts] Webhook alert failed', { severity: payload.severity });
  return ok;
}

/**
 * Dispatch ALERT_HUMAN to all configured channels (Slack, webhook).
 * Deduplicates by severity+message within 5 min; retries failed requests with exponential backoff.
 */
export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  const fullPayload: AlertPayload = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: payload.source ?? 'aegis-agent',
  };

  const hash = alertHash(fullPayload);
  if (isDuplicate(hash)) {
    logger.debug('[Alerts] Skipping duplicate alert', { severity: fullPayload.severity });
    return true;
  }

  logger.info('[Alerts] ALERT_HUMAN', { severity: fullPayload.severity, message: fullPayload.message });

  const [slackOk, webhookOk] = await Promise.all([
    sendSlackAlert(fullPayload),
    sendWebhookAlert(fullPayload),
  ]);

  if (slackOk || webhookOk) markSent(hash);
  return slackOk || webhookOk;
}
