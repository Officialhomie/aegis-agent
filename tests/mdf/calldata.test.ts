/**
 * Unit tests for MDF redeemDelegations calldata builder.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRedeemDelegationsCalldata,
  serializeMdfDelegation,
  deserializeMdfDelegation,
} from '../../src/lib/mdf/calldata';
import { ROOT_AUTHORITY } from '../../src/lib/mdf/types';
import type { MdfDelegation } from '../../src/lib/mdf/types';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`;
const MOCK_TARGET = '0x1234567890123456789012345678901234567890' as `0x${string}`;
const MOCK_DELEGATE = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd' as `0x${string}`;
const MOCK_DELEGATOR = '0x1111111111111111111111111111111111111111' as `0x${string}`;

const mockDelegation: MdfDelegation = {
  delegate: MOCK_DELEGATE,
  delegator: MOCK_DELEGATOR,
  authority: ROOT_AUTHORITY,
  caveats: [],
  salt: BigInt(0),
  signature: '0x' as `0x${string}`,
};

describe('buildRedeemDelegationsCalldata', () => {
  it('returns a valid hex string starting with 0x', () => {
    const result = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    expect(result.callData).toMatch(/^0x[a-fA-F0-9]+$/);
  });

  it('includes the redeemDelegations function selector (0x first 4 bytes)', () => {
    const result = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    // redeemDelegations(bytes[],bytes32[],bytes[]) selector
    // keccak256("redeemDelegations(bytes[],bytes32[],bytes[])") first 4 bytes
    expect(result.callData.length).toBeGreaterThan(10);
    expect(result.callData.startsWith('0x')).toBe(true);
  });

  it('returns a delegation hash', () => {
    const result = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    expect(result.delegationHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('produces different calldata for different targets', () => {
    const result1 = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    const result2 = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: ZERO_ADDR,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    expect(result1.callData).not.toEqual(result2.callData);
  });

  it('produces different calldata for different innerCalldata', () => {
    const result1 = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0x',
    });
    const result2 = buildRedeemDelegationsCalldata({
      delegation: mockDelegation,
      targetContract: MOCK_TARGET,
      value: BigInt(0),
      innerCalldata: '0xa9059cbb',
    });
    expect(result1.callData).not.toEqual(result2.callData);
  });
});

describe('serializeMdfDelegation / deserializeMdfDelegation', () => {
  it('round-trips correctly', () => {
    const serialized = serializeMdfDelegation(mockDelegation);
    const deserialized = deserializeMdfDelegation(serialized);

    expect(deserialized.delegate).toBe(mockDelegation.delegate);
    expect(deserialized.delegator).toBe(mockDelegation.delegator);
    expect(deserialized.authority).toBe(mockDelegation.authority);
    expect(deserialized.salt).toBe(mockDelegation.salt);
    expect(deserialized.signature).toBe(mockDelegation.signature);
    expect(deserialized.caveats).toHaveLength(0);
  });

  it('handles large bigint salt without precision loss', () => {
    const withLargeSalt: MdfDelegation = {
      ...mockDelegation,
      salt: BigInt('999999999999999999999999999'),
    };
    const serialized = serializeMdfDelegation(withLargeSalt);
    const deserialized = deserializeMdfDelegation(serialized);
    expect(deserialized.salt).toBe(withLargeSalt.salt);
  });

  it('preserves caveats', () => {
    const withCaveats: MdfDelegation = {
      ...mockDelegation,
      caveats: [
        {
          enforcer: MOCK_TARGET,
          terms: '0xabcd',
          args: '0x',
        },
      ],
    };
    const serialized = serializeMdfDelegation(withCaveats);
    const deserialized = deserializeMdfDelegation(serialized);
    expect(deserialized.caveats).toHaveLength(1);
    expect(deserialized.caveats[0].enforcer).toBe(MOCK_TARGET);
    expect(deserialized.caveats[0].terms).toBe('0xabcd');
  });
});
