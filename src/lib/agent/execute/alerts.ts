/**
 * Aegis Agent - Alert System
 *
 * Sends ALERT_HUMAN notifications via Slack, email (webhook), or generic webhook.
 */

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertPayload {
  severity: AlertSeverity;
  message: string;
  suggestedAction?: string;
  source?: string;
  timestamp?: string;
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

/**
 * Send alert to Slack via incoming webhook
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        icon_emoji: emoji[payload.severity],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send alert to generic webhook (e.g. email service, PagerDuty)
 */
async function sendWebhookAlert(payload: AlertPayload): Promise<boolean> {
  const url = getAlertWebhookUrl();
  if (!url) return false;

  const body = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    email: getAlertEmail(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatch ALERT_HUMAN to all configured channels (Slack, webhook).
 * Logs to console always; returns true if at least one channel succeeded.
 */
export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  const fullPayload: AlertPayload = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: payload.source ?? 'aegis-agent',
  };

  console.log('[Aegis] ALERT_HUMAN:', fullPayload.severity, fullPayload.message);

  const [slackOk, webhookOk] = await Promise.all([
    sendSlackAlert(fullPayload),
    sendWebhookAlert(fullPayload),
  ]);

  return slackOk || webhookOk;
}
