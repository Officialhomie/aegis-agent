/**
 * Abuse detection tests - fail-closed behavior (FLAW-5)
 *
 * When Redis/state store throws, abuse checks must return isAbusive: true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkSybilAttack,
  checkDustSpam,
  detectAbuse,
} from '../../../src/lib/agent/security/abuse-detection';

const mockGet = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
  }),
}));

describe('Abuse detection fail-closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checkSybilAttack returns isAbusive: true when state store throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Redis connection refused'));
    const result = await checkSybilAttack('0x1234567890123456789012345678901234567890');
    expect(result.isAbusive).toBe(true);
    expect(result.reason).toContain('failing closed');
  });

  it('checkDustSpam returns isAbusive: true when fetch throws', async () => {
    vi.stubEnv('BLOCKSCOUT_API_URL', 'https://api.blockscout.com');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const result = await checkDustSpam('0x1234567890123456789012345678901234567890');
    expect(result.isAbusive).toBe(true);
    expect(result.reason).toContain('failing closed');

    globalThis.fetch = originalFetch;
  });

  it('detectAbuse returns isAbusive: true when any check throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Redis timeout'));
    const result = await detectAbuse('0x1234567890123456789012345678901234567890');
    expect(result.isAbusive).toBe(true);
    expect(result.reason).toContain('failing closed');
  });
});
