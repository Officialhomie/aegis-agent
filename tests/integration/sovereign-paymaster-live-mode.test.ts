/**
 * Integration tests for sovereign paymaster mode.
 *
 * When AEGIS_PAYMASTER_ADDRESS + AEGIS_PAYMASTER_SIGNING_KEY are both set,
 * canExecuteSponsorship() must return { mode: 'LIVE' } for any non-suspended
 * protocol, bypassing the CDP allowlist requirement entirely.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canExecuteSponsorship } from '../../src/lib/protocol/onboarding';

const PAYMASTER_ADDRESS = '0x0000000000000000000000000000000000000001';
const SIGNING_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

// Mock Prisma
vi.mock('../../src/lib/db', () => ({
  getPrisma: vi.fn(),
}));

function mockProtocol(overrides: Partial<{
  onboardingStatus: string;
  simulationModeUntil: Date | null;
}>) {
  const defaults = {
    onboardingStatus: 'APPROVED_SIMULATION',
    simulationModeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
  return { ...defaults, ...overrides };
}

async function setupDb(protocol: ReturnType<typeof mockProtocol> | null) {
  const { getPrisma } = await import('../../src/lib/db');
  vi.mocked(getPrisma).mockReturnValue({
    protocolSponsor: {
      findUnique: vi.fn().mockResolvedValue(protocol),
    },
  } as never);
}

describe('canExecuteSponsorship — sovereign paymaster mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubEnv('AEGIS_PAYMASTER_ADDRESS', PAYMASTER_ADDRESS);
    vi.stubEnv('AEGIS_PAYMASTER_SIGNING_KEY', SIGNING_KEY);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns LIVE mode for APPROVED_SIMULATION protocol when sovereign paymaster configured', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'APPROVED_SIMULATION' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result).toEqual({ allowed: true, mode: 'LIVE' });
  });

  it('returns LIVE mode for PENDING_REVIEW protocol when sovereign paymaster configured', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'PENDING_REVIEW' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result).toEqual({ allowed: true, mode: 'LIVE' });
  });

  it('returns LIVE mode for LIVE protocol when sovereign paymaster configured', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'LIVE' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result).toEqual({ allowed: true, mode: 'LIVE' });
  });

  it('returns allowed:false for SUSPENDED protocol even when sovereign paymaster configured', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'SUSPENDED' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/suspended/i);
  });

  it('returns allowed:false when protocol not found', async () => {
    await setupDb(null);
    const result = await canExecuteSponsorship('nonexistent');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });
});

describe('canExecuteSponsorship — CDP fallback (no sovereign paymaster)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AEGIS_PAYMASTER_ADDRESS;
    delete process.env.AEGIS_PAYMASTER_SIGNING_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns SIMULATION when APPROVED_SIMULATION and env vars not set', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'APPROVED_SIMULATION' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result).toEqual({ allowed: true, mode: 'SIMULATION' });
  });

  it('returns LIVE when status is LIVE (no sovereign paymaster)', async () => {
    await setupDb(mockProtocol({ onboardingStatus: 'LIVE' }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result).toEqual({ allowed: true, mode: 'LIVE' });
  });

  it('returns allowed:false when simulation expired and no CDP approval', async () => {
    await setupDb(mockProtocol({
      onboardingStatus: 'APPROVED_SIMULATION',
      simulationModeUntil: new Date(Date.now() - 1000), // expired
    }));
    const result = await canExecuteSponsorship('test-protocol');
    expect(result.allowed).toBe(false);
  });

  it('partial sovereign paymaster config (only address, no key) does not trigger bypass', async () => {
    vi.stubEnv('AEGIS_PAYMASTER_ADDRESS', PAYMASTER_ADDRESS);
    // AEGIS_PAYMASTER_SIGNING_KEY not set
    await setupDb(mockProtocol({ onboardingStatus: 'APPROVED_SIMULATION' }));
    const result = await canExecuteSponsorship('test-protocol');
    // Should fall through to SIMULATION, not LIVE
    expect(result.mode).toBe('SIMULATION');
  });
});
