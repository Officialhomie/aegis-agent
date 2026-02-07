/**
 * checkKeystoreAvailability: priority order, env vs keystore, invalid hex, address shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const validHex = '0x0000000000000000000000000000000000000000000000000000000000000001';

import { checkKeystoreAvailability } from '../../src/lib/keystore';

describe('checkKeystoreAvailability', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.KEYSTORE_ACCOUNT;
    delete process.env.KEYSTORE_PASSWORD;
    delete process.env.CAST_PASSWORD;
    delete process.env.EXECUTE_WALLET_PRIVATE_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
  });

  it('returns available true and method env_execute when EXECUTE_WALLET_PRIVATE_KEY is valid', async () => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
    const status = await checkKeystoreAvailability();
    expect(status.available).toBe(true);
    expect(status.method).toBe('env_execute');
    expect(status.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('returns available true and method env_agent when only AGENT_PRIVATE_KEY is valid', async () => {
    vi.stubEnv('AGENT_PRIVATE_KEY', validHex);
    const status = await checkKeystoreAvailability();
    expect(status.available).toBe(true);
    expect(status.method).toBe('env_agent');
    expect(status.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('returns available false and method none when no keys configured', async () => {
    const status = await checkKeystoreAvailability();
    expect(status.available).toBe(false);
    expect(status.method).toBe('none');
    expect(status.error).toBeDefined();
  });

  it('returns available false when env key is invalid hex', async () => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', '0xinvalid');
    const status = await checkKeystoreAvailability();
    expect(status.available).toBe(false);
    expect(status.method).toBe('none');
  });

  it('priority order: env_execute used when EXECUTE_WALLET_PRIVATE_KEY set', async () => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
    vi.stubEnv('AGENT_PRIVATE_KEY', validHex);
    const status = await checkKeystoreAvailability();
    expect(status.method).toBe('env_execute');
  });

  it('address is valid Ethereum address when key available', async () => {
    vi.stubEnv('EXECUTE_WALLET_PRIVATE_KEY', validHex);
    const status = await checkKeystoreAvailability();
    expect(status.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(status.address!.length).toBe(42);
  });
});
