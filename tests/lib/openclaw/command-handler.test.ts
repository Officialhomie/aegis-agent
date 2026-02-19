/**
 * OpenClaw command handler unit tests.
 *
 * Tests parseCommand() for all supported commands and natural-language variants.
 * Tests executeCommand() for key commands with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommand, executeCommand } from '../../../src/lib/agent/openclaw/command-handler';

// Mock dependencies used by executeCommand
vi.mock('../../../src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNX: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../src/lib/agent/openclaw/memory-manager', () => ({
  readMemory: vi.fn().mockResolvedValue('[2026-02-18] CYCLE: Test entry'),
}));

vi.mock('../../../src/lib/agent/state/reserve-state', () => ({
  getReserveState: vi.fn().mockResolvedValue({
    ethBalance: 0.42,
    usdcBalance: 150.0,
    runwayDays: 8.5,
    healthScore: 85,
  }),
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// parseCommand tests
// ──────────────────────────────────────────────────────────────────────────────

describe('parseCommand', () => {
  it.each([
    ['status', 'status'],
    ['Status', 'status'],
    ['health check', 'status'],
    ['how are you', 'status'],
    ['what is my balance', 'status'],
    ['check runway', 'status'],
  ])('parses "%s" as status', (input, expected) => {
    expect(parseCommand(input).name).toBe(expected);
  });

  it.each([
    ['cycle', 'cycle'],
    ['run cycle', 'cycle'],
    ['trigger cycle', 'cycle'],
    ['trigger a cycle now', 'cycle'],
    ['trigger', 'cycle'],
  ])('parses "%s" as cycle', (input, expected) => {
    expect(parseCommand(input).name).toBe(expected);
  });

  it.each([
    ['report', 'report'],
    ['activity', 'report'],
    ['show me a summary', 'report'],
    ['what did you do', 'report'],
    ['show log', 'report'],
  ])('parses "%s" as report', (input, expected) => {
    expect(parseCommand(input).name).toBe(expected);
  });

  it.each([
    ['pause', 'pause'],
    ['stop', 'pause'],
    ['pause the agent', 'pause'],
  ])('parses "%s" as pause', (input, expected) => {
    expect(parseCommand(input).name).toBe(expected);
  });

  it.each([
    ['resume', 'resume'],
    ['start', 'resume'],
    ['start again', 'resume'],
    ['unpause', 'resume'],
    ['resume the agent', 'resume'],
  ])('parses "%s" as resume', (input, expected) => {
    expect(parseCommand(input).name).toBe(expected);
  });

  it('parses sponsor command with valid wallet and protocol', () => {
    const cmd = parseCommand('sponsor 0xabc123def456abc123def456abc123def456abc1 bankr');
    expect(cmd.name).toBe('sponsor');
    expect(cmd.args.wallet).toBe('0xabc123def456abc123def456abc123def456abc1');
    expect(cmd.args.protocol).toBe('bankr');
  });

  it('parses sponsor command even with mixed case wallet', () => {
    const cmd = parseCommand('sponsor 0xABC123DEF456ABC123DEF456ABC123DEF456ABC1 uniswap');
    expect(cmd.name).toBe('sponsor');
    expect(cmd.args.wallet).toBe('0xABC123DEF456ABC123DEF456ABC123DEF456ABC1');
  });

  it('returns help for unrecognised input', () => {
    expect(parseCommand('what is the meaning of life').name).toBe('help');
    expect(parseCommand('').name).toBe('help');
    expect(parseCommand('gm').name).toBe('help');
  });

  it('preserves rawInput on all commands', () => {
    const input = 'how are you doing today?';
    const cmd = parseCommand(input);
    expect(cmd.rawInput).toBe(input);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// executeCommand tests
// ──────────────────────────────────────────────────────────────────────────────

describe('executeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status command returns reserve state summary', async () => {
    const cmd = parseCommand('status');
    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('ETH: 0.42');
    expect(result.message).toContain('USDC: 150.00');
    expect(result.message).toContain('runway: 8.5 days');
    expect(result.message).toContain('health: 85/100');
  });

  it('report command returns memory log', async () => {
    const cmd = parseCommand('report');
    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('CYCLE');
  });

  it('pause command sets state store flag', async () => {
    const { getStateStore } = await import('../../../src/lib/agent/state-store');
    const storeMock = await getStateStore();

    const cmd = parseCommand('pause');
    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('paused');
    expect(storeMock.set).toHaveBeenCalledWith('aegis:openclaw:paused', 'true');
  });

  it('resume command clears state store flag', async () => {
    const { getStateStore } = await import('../../../src/lib/agent/state-store');
    const storeMock = await getStateStore();

    const cmd = parseCommand('resume');
    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('resumed');
    expect(storeMock.set).toHaveBeenCalledWith('aegis:openclaw:paused', 'false');
  });

  it('help command returns command list', async () => {
    const cmd = parseCommand('help');
    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('status');
    expect(result.message).toContain('cycle');
    expect(result.message).toContain('sponsor');
    expect(result.message).toContain('report');
    expect(result.message).toContain('pause');
    expect(result.message).toContain('resume');
  });

  it('sponsor command rejects invalid wallet', async () => {
    const cmd = { name: 'sponsor' as const, args: { wallet: 'not-a-wallet', protocol: 'uniswap' }, rawInput: '' };
    const result = await executeCommand(cmd);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid wallet');
  });

  it('sponsor command rejects missing protocol', async () => {
    const cmd = {
      name: 'sponsor' as const,
      args: { wallet: '0xabc123def456abc123def456abc123def456abc1', protocol: '' },
      rawInput: '',
    };
    const result = await executeCommand(cmd);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Protocol required');
  });
});
