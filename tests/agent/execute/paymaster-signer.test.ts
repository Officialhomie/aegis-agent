/**
 * Paymaster signer unit tests (computeApprovalHash, signPaymasterApproval, decodePaymasterAndData)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeApprovalHash,
  signPaymasterApproval,
  decodePaymasterAndData,
} from '../../../src/lib/agent/execute/paymaster-signer';

const TEST_SIGNING_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const TEST_PAYMASTER_ADDRESS = '0x0000000000000000000000000000000000000001' as `0x${string}`;

describe('computeApprovalHash', () => {
  it('produces deterministic hash for same inputs', () => {
    const params = {
      sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      nonce: BigInt(0),
      callData: '0x' as `0x${string}`,
      validUntil: 1000000,
      validAfter: 999000,
      agentTier: 2,
      paymasterAddress: TEST_PAYMASTER_ADDRESS,
      chainId: 84532,
    };
    const hash1 = computeApprovalHash(params);
    const hash2 = computeApprovalHash(params);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('produces different hash for different sender', () => {
    const base = {
      nonce: BigInt(0),
      callData: '0x' as `0x${string}`,
      validUntil: 1000000,
      validAfter: 999000,
      agentTier: 2,
      paymasterAddress: TEST_PAYMASTER_ADDRESS,
      chainId: 84532,
    };
    const hash1 = computeApprovalHash({
      ...base,
      sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
    });
    const hash2 = computeApprovalHash({
      ...base,
      sender: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
    });
    expect(hash1).not.toBe(hash2);
  });
});

describe('signPaymasterApproval', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubEnv('AEGIS_PAYMASTER_SIGNING_KEY', TEST_SIGNING_KEY);
    vi.stubEnv('AEGIS_PAYMASTER_ADDRESS', TEST_PAYMASTER_ADDRESS);
    vi.stubEnv('AGENT_CHAIN_ID', '84532');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 162-byte paymasterAndData when env is set', async () => {
    const signed = await signPaymasterApproval({
      sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      nonce: BigInt(0),
      callData: '0x' as `0x${string}`,
      agentTier: 2,
    });
    expect(signed.paymasterAndData).toMatch(/^0x[a-fA-F0-9]+$/);
    expect((signed.paymasterAndData.length - 2) / 2).toBe(162);
    expect(signed.approvalHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(signed.validUntil).toBeGreaterThan(signed.validAfter);
    expect(signed.validAfter).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000) - 2);
  });

  it('throws when AEGIS_PAYMASTER_SIGNING_KEY not configured', async () => {
    delete process.env.AEGIS_PAYMASTER_SIGNING_KEY;
    await expect(
      signPaymasterApproval({
        sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        nonce: BigInt(0),
        callData: '0x' as `0x${string}`,
        agentTier: 2,
      })
    ).rejects.toThrow('AEGIS_PAYMASTER_SIGNING_KEY');
  });

  it('throws when AEGIS_PAYMASTER_ADDRESS not configured', async () => {
    delete process.env.AEGIS_PAYMASTER_ADDRESS;
    await expect(
      signPaymasterApproval({
        sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        nonce: BigInt(0),
        callData: '0x' as `0x${string}`,
        agentTier: 2,
      })
    ).rejects.toThrow('AEGIS_PAYMASTER_ADDRESS');
  });

  it('validUntil and validAfter are within expected window', async () => {
    const signed = await signPaymasterApproval({
      sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      nonce: BigInt(0),
      callData: '0x' as `0x${string}`,
      agentTier: 2,
      validDurationMs: 300_000,
    });
    const now = Math.floor(Date.now() / 1000);
    expect(signed.validAfter).toBeGreaterThanOrEqual(now - 2);
    expect(signed.validUntil).toBeGreaterThanOrEqual(signed.validAfter + 299);
  });
});

describe('decodePaymasterAndData', () => {
  it('correctly decodes round-trip with signPaymasterApproval', async () => {
    vi.stubEnv('AEGIS_PAYMASTER_SIGNING_KEY', TEST_SIGNING_KEY);
    vi.stubEnv('AEGIS_PAYMASTER_ADDRESS', TEST_PAYMASTER_ADDRESS);
    vi.stubEnv('AGENT_CHAIN_ID', '84532');

    const signed = await signPaymasterApproval({
      sender: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      nonce: BigInt(1),
      callData: '0xdeadbeef' as `0x${string}`,
      agentTier: 1,
    });

    const decoded = decodePaymasterAndData(signed.paymasterAndData);
    expect(decoded.paymasterAddress.toLowerCase()).toBe(TEST_PAYMASTER_ADDRESS.toLowerCase());
    expect(decoded.validUntil).toBe(signed.validUntil);
    expect(decoded.validAfter).toBe(signed.validAfter);
    expect(decoded.agentTier).toBe(1);
    expect(decoded.approvalHash).toBe(signed.approvalHash);
    expect(decoded.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
  });

  it('throws when paymasterAndData too short', () => {
    expect(() => decodePaymasterAndData('0x1234' as `0x${string}`)).toThrow('too short');
  });
});
