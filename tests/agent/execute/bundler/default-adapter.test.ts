/**
 * Bundler adapter unit tests (DefaultBundlerAdapter, createBundler)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultBundlerAdapter, createBundler } from '../../../../src/lib/agent/execute/bundler';

const mockCheckBundlerHealth = vi.hoisted(() => vi.fn());
const mockSubmitAndWaitForUserOp = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/lib/agent/execute/bundler-client', () => ({
  checkBundlerHealth: (...args: unknown[]) => mockCheckBundlerHealth(...args),
  estimateUserOpGas: vi.fn().mockResolvedValue(null),
  submitUserOperation: vi.fn().mockResolvedValue({ userOpHash: '0xabc' }),
  waitForUserOpReceipt: vi.fn().mockResolvedValue({}),
  submitAndWaitForUserOp: (...args: unknown[]) => mockSubmitAndWaitForUserOp(...args),
  getActiveBundlerRpcUrl: vi.fn().mockReturnValue('https://bundler.example.com'),
}));

describe('DefaultBundlerAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckBundlerHealth.mockResolvedValue({
      available: true,
      chainId: 84532,
      supportedEntryPoints: [],
      latencyMs: 50,
    });
  });

  it('checkHealth delegates to bundler-client and returns status', async () => {
    const adapter = new DefaultBundlerAdapter();
    const status = await adapter.checkHealth();
    expect(mockCheckBundlerHealth).toHaveBeenCalled();
    expect(status.available).toBe(true);
    expect(status.chainId).toBe(84532);
  });

  it('submitAndWait propagates bundler errors', async () => {
    mockSubmitAndWaitForUserOp.mockRejectedValue(new Error('Bundler timeout'));
    const adapter = new DefaultBundlerAdapter();
    await expect(
      adapter.submitAndWait({} as any)
    ).rejects.toThrow('Bundler timeout');
  });
});

describe('createBundler', () => {
  it('returns DefaultBundlerAdapter instance', () => {
    const bundler = createBundler();
    expect(bundler).toBeInstanceOf(DefaultBundlerAdapter);
    expect(bundler.name).toBeDefined();
  });
});
