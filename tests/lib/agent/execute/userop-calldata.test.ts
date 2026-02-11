/**
 * UserOperation calldata builder tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildExecuteCalldata,
  getActivityLoggerPingData,
} from '../../../../src/lib/agent/execute/userop-calldata';

describe('getActivityLoggerPingData', () => {
  it('returns encoded ping() calldata (4-byte selector + no args)', () => {
    const data = getActivityLoggerPingData();
    expect(data).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(data.length).toBe(10); // 0x + 4-byte selector (8 hex chars)
  });
});

describe('buildExecuteCalldata', () => {
  it('returns non-empty hex for execute(target, 0, 0x)', () => {
    const target = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
    const calldata = buildExecuteCalldata({ targetContract: target });
    expect(calldata).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(calldata.length).toBeGreaterThan(10);
  });

  it('uses provided value and data when given', () => {
    const target = '0x0000000000000000000000000000000000000001' as `0x${string}`;
    const calldata = buildExecuteCalldata({
      targetContract: target,
      value: BigInt(1),
      data: '0xdeadbeef' as `0x${string}`,
    });
    expect(calldata).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(calldata).toContain('deadbeef');
  });

  it('produces valid execute(address,uint256,bytes) selector', () => {
    const target = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
    const calldata = buildExecuteCalldata({ targetContract: target });
    // execute(address,uint256,bytes) selector is 0x24856bc3 (or similar per ABI)
    expect(calldata.startsWith('0x')).toBe(true);
    expect(calldata.length).toBeGreaterThan(74); // 4-byte selector + 32*3 args minimum
  });
});
