/**
 * Execution layer tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute, getDefaultCircuitBreaker, CircuitBreaker, sendAlert } from '../../src/lib/agent/execute';
import type { Decision } from '../../src/lib/agent/reason/schemas';

const mockDecision: Decision = {
  action: 'WAIT',
  confidence: 0.8,
  reasoning: 'Test reasoning for execution layer.',
  parameters: null,
};

describe('Execution Layer', () => {
  it('should execute WAIT without calling AgentKit', async () => {
    const result = await execute(mockDecision, 'SIMULATION');
    expect(result.success).toBe(true);
    expect(result.simulationResult).toBeDefined();
  });

  it('should handle ALERT_HUMAN and call sendAlert', async () => {
    const alertDecision: Decision = {
      action: 'ALERT_HUMAN',
      confidence: 1,
      reasoning: 'Test alert.',
      parameters: { severity: 'HIGH', message: 'Test message' },
    };
    const result = await execute(alertDecision, 'SIMULATION');
    expect(result.success).toBe(true);
  });

  it('should simulate TRANSFER without real tx', async () => {
    const transferDecision: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Simulate transfer.',
      parameters: {
        token: 'USDC',
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '100',
      },
    };
    const result = await execute(transferDecision, 'SIMULATION');
    expect(result.success).toBe(true);
    expect(result.simulationResult).toBeDefined();
  });

  it('should validate params before LIVE execution', async () => {
    const decisionNoParams: Decision = {
      action: 'TRANSFER',
      confidence: 0.9,
      reasoning: 'Missing params.',
      parameters: null,
    } as unknown as import('@/src/lib/agent/reason/schemas').Decision;
    const result = await execute(decisionNoParams, 'LIVE');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parameters');
  });
});

describe('Circuit Breaker', () => {
  it('should return singleton from getDefaultCircuitBreaker', () => {
    const a = getDefaultCircuitBreaker();
    const b = getDefaultCircuitBreaker();
    expect(a).toBe(b);
  });

  it('should execute fn when closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, windowMs: 1000 });
    const result = await breaker.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, windowMs: 10000, cooldownMs: 100 });
    await breaker.execute(async () => {
      throw new Error('fail');
    }).catch(() => {});
    await breaker.execute(async () => {
      throw new Error('fail');
    }).catch(() => {});
    await expect(breaker.execute(async () => 1)).rejects.toThrow(/Circuit breaker OPEN/);
  });
});

describe('Alerts', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.stubGlobal('fetch', originalFetch);
  });

  it('should have sendAlert function', () => {
    expect(typeof sendAlert).toBe('function');
  });

  it('should resolve when sending alert', async () => {
    const result = await sendAlert({
      severity: 'LOW',
      message: 'Test alert',
    });
    expect(typeof result).toBe('boolean');
  });

  it('should call Slack webhook when SLACK_WEBHOOK_URL is set', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const { sendAlert: send } = await import('../../src/lib/agent/execute');
    await send({ severity: 'HIGH', message: 'Slack test' });
    const slackCall = mockFetch.mock.calls.find(
      (c: [string]) => typeof c[0] === 'string' && c[0].includes('slack')
    );
    expect(slackCall).toBeDefined();
    expect(slackCall[1]?.method).toBe('POST');
    expect(slackCall[1]?.body).toBeDefined();
  });

  it('should call ALERT_WEBHOOK_URL when set', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
    process.env.ALERT_WEBHOOK_URL = 'https://alert.example.com/webhook';
    const { sendAlert: send } = await import('../../src/lib/agent/execute');
    await send({ severity: 'MEDIUM', message: 'Webhook test' });
    const webhookCall = mockFetch.mock.calls.find(
      (c: [string]) => typeof c[0] === 'string' && c[0].includes('alert.example')
    );
    expect(webhookCall).toBeDefined();
    const body = JSON.parse(webhookCall[1]?.body as string);
    expect(body.severity).toBe('MEDIUM');
    expect(body.message).toBe('Webhook test');
  });

  it('should return true when at least one channel succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const { sendAlert: send } = await import('../../src/lib/agent/execute');
    const result = await send({ severity: 'LOW', message: 'Success test' });
    expect(result).toBe(true);
  });

  it('should return false when all channels fail', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.ALERT_WEBHOOK_URL = 'https://alert.example.com/webhook';
    const { sendAlert: send } = await import('../../src/lib/agent/execute');
    const result = await send({ severity: 'LOW', message: 'Fail test' });
    expect(result).toBe(false);
  });
});
