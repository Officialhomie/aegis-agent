/**
 * API route: POST /api/agent/cycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;

function requestWithAuth(body: unknown, token: string | null = 'test-key'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/api/agent/cycle', {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/agent/cycle', () => {
  beforeEach(async () => {
    process.env = { ...originalEnv, AEGIS_API_KEY: 'test-key' };
    vi.doMock('../../src/lib/agent', () => ({
      runAgentCycle: vi.fn().mockResolvedValue({
        observations: [],
        currentDecision: null,
        executionResult: null,
      }),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { POST } = await import('../../app/api/agent/cycle/route');
    const req = new Request('http://localhost/api/agent/cycle', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 401 when Bearer token is invalid', async () => {
    const { POST } = await import('../../app/api/agent/cycle/route');
    const req = requestWithAuth({}, 'wrong-token');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is invalid', async () => {
    const { POST } = await import('../../app/api/agent/cycle/route');
    const req = requestWithAuth({ confidenceThreshold: 2 }); // > 1 invalid
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid');
  });

  it('returns 200 with state when auth and body valid', async () => {
    vi.doMock('../../src/lib/agent', () => ({
      runAgentCycle: vi.fn().mockResolvedValue({
        observations: [{ id: '1' }],
        currentDecision: { action: 'WAIT' },
        executionResult: null,
      }),
    }));
    const { POST } = await import('../../app/api/agent/cycle/route');
    const req = requestWithAuth({ confidenceThreshold: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.state).toBeDefined();
    expect(typeof json.state.observationsCount).toBe('number');
  });
});
