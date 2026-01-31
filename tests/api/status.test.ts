/**
 * API route: GET /api/agent/status
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;

function requestWithAuth(token: string | null = 'test-key'): Request {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/api/agent/status', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/agent/status', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, AEGIS_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('../../app/api/agent/status/route');
    const req = new Request('http://localhost/api/agent/status', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 401 when Bearer token is wrong', async () => {
    const { GET } = await import('../../app/api/agent/status/route');
    const req = requestWithAuth('wrong');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with healthy status when auth valid', async () => {
    const { GET } = await import('../../app/api/agent/status/route');
    const req = requestWithAuth();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.timestamp).toBeDefined();
    expect(typeof json.uptime).toBe('number');
  });
});
