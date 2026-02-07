/**
 * API route: GET /api/dashboard/status - KeyGuard state, no address exposure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetKeyGuardState = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/key-guard', () => ({
  getKeyGuardState: () => mockGetKeyGuardState(),
}));

describe('GET /api/dashboard/status', () => {
  beforeEach(() => {
    mockGetKeyGuardState.mockReset();
  });

  it('returns 200 with mode, canSign, signingMethod, hasWallet when KeyGuard initialized', async () => {
    mockGetKeyGuardState.mockReturnValue({
      mode: 'LIVE',
      canSign: true,
      method: 'env_execute',
    });
    const { GET } = await import('../../src/app/api/dashboard/status/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe('LIVE');
    expect(json.canSign).toBe(true);
    expect(json.signingMethod).toBe('env_execute');
    expect(json.hasWallet).toBe(true);
  });

  it('returns correct fields when canSign true (LIVE mode)', async () => {
    mockGetKeyGuardState.mockReturnValue({
      mode: 'LIVE',
      canSign: true,
      method: 'keystore',
    });
    const { GET } = await import('../../src/app/api/dashboard/status/route');
    const res = await GET();
    const json = await res.json();
    expect(json.canSign).toBe(true);
    expect(json.hasWallet).toBe(true);
    expect(json.mode).toBe('LIVE');
  });

  it('returns correct fields when canSign false (SIMULATION mode)', async () => {
    mockGetKeyGuardState.mockReturnValue({
      mode: 'SIMULATION',
      canSign: false,
      method: 'none',
    });
    const { GET } = await import('../../src/app/api/dashboard/status/route');
    const res = await GET();
    const json = await res.json();
    expect(json.canSign).toBe(false);
    expect(json.hasWallet).toBe(false);
    expect(json.signingMethod).toBe('none');
  });

  it('returns 500 with error when KeyGuard not initialized', async () => {
    mockGetKeyGuardState.mockImplementation(() => {
      throw new Error('KeyGuard not initialized. Call initializeKeyGuard() first.');
    });
    const { GET } = await import('../../src/app/api/dashboard/status/route');
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('KeyGuard not initialized');
    expect(json.mode).toBe('UNKNOWN');
    expect(json.canSign).toBe(false);
    expect(json.hasWallet).toBe(false);
  });

  it('does NOT expose wallet address in response', async () => {
    mockGetKeyGuardState.mockReturnValue({
      mode: 'LIVE',
      canSign: true,
      method: 'env_execute',
      address: '0x1234567890123456789012345678901234567890',
    });
    const { GET } = await import('../../src/app/api/dashboard/status/route');
    const res = await GET();
    const json = await res.json();
    expect(json.address).toBeUndefined();
  });
});
