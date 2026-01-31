/**
 * API route: POST /api/reactive/event
 */

import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;
const SECRET = 'reactive-secret';

function requestReactive(body: unknown, options: { token?: string; signature?: boolean } = {}): Request {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${options.token ?? 'test-key'}`,
  };
  if (options.signature !== false && SECRET) {
    const sig = createHmac('sha256', SECRET).update(bodyText).digest('hex');
    headers['x-reactive-signature'] = sig;
  }
  return new Request('http://localhost/api/reactive/event', {
    method: 'POST',
    headers,
    body: bodyText,
  });
}

describe('POST /api/reactive/event', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, AEGIS_API_KEY: 'test-key', REACTIVE_CALLBACK_SECRET: SECRET };
    vi.doMock('../../src/lib/agent', () => ({
      runAgentCycle: vi.fn().mockResolvedValue({}),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns 401 when API auth missing', async () => {
    const { POST } = await import('../../app/api/reactive/event/route');
    const req = requestReactive({ chainId: 84532, event: 'test', data: {} }, { token: '' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when reactive signature missing or invalid', async () => {
    const { POST } = await import('../../app/api/reactive/event/route');
    const req = new Request('http://localhost/api/reactive/event', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: 84532, event: 'test', data: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body invalid', async () => {
    const { POST } = await import('../../app/api/reactive/event/route');
    const req = requestReactive({ chainId: -1, event: '', data: {} });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid');
  });

  it('returns 200 when auth and signature valid and body valid', async () => {
    const { POST } = await import('../../app/api/reactive/event/route');
    const req = requestReactive({ chainId: 84532, event: 'Transfer', data: { from: '0x' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.triggered).toBe(true);
  });
});
