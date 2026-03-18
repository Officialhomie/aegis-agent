/**
 * Phase 2: OpenClaw Management Commands Integration Tests
 *
 * Tests all 6 new OpenClaw commands:
 * - pause_timed: "pause for 2 hours"
 * - set_budget: "set budget to $500"
 * - analytics: "show top 10 users this week"
 * - block_wallet: "block wallet 0x..."
 * - set_gas_cap: "set gas cap to 50 gwei"
 * - topup: "topup 1000"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('@/src/lib/db', () => ({
  getPrisma: vi.fn(() => ({
    runtimeOverride: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'override-id' }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    blockedWallet: {
      upsert: vi.fn().mockResolvedValue({ id: 'blocked-id' }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sponsorshipRecord: {
      groupBy: vi.fn().mockResolvedValue([
        {
          userAddress: '0x1234567890123456789012345678901234567890',
          _sum: { actualCostUSD: 100.5 },
          _count: 50,
          _avg: { actualCostUSD: 2.01 },
        },
      ]),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { actualCostUSD: 500 },
        _count: 200,
        _avg: { actualCostUSD: 2.5 },
      }),
      count: vi.fn().mockResolvedValue(150),
    },
  })),
}));

// Mock logger
vi.mock('@/src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock session manager
vi.mock('@/src/lib/agent/openclaw/session-manager', () => ({
  getProtocolIdFromSession: vi.fn().mockResolvedValue('test-protocol'),
  createOpenClawSession: vi.fn().mockImplementation(async (sessionId: string, protocolId: string) => ({
    sessionId,
    protocolId,
  })),
  isSessionValid: vi.fn().mockResolvedValue(true),
}));

// Mock state store
vi.mock('@/src/lib/agent/state-store', () => ({
  getStateStore: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  }),
}));

describe('Phase 2: NLP Parsers', () => {
  describe('parseDuration', () => {
    it('should parse hours correctly', async () => {
      const { parseDuration } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseDuration('2 hours')).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration('1 hour')).toBe(1 * 60 * 60 * 1000);
      expect(parseDuration('5 hrs')).toBe(5 * 60 * 60 * 1000);
      expect(parseDuration('pause for 3h')).toBe(3 * 60 * 60 * 1000);
    });

    it('should parse minutes correctly', async () => {
      const { parseDuration } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseDuration('30 minutes')).toBe(30 * 60 * 1000);
      expect(parseDuration('45 mins')).toBe(45 * 60 * 1000);
      expect(parseDuration('15m')).toBe(15 * 60 * 1000);
    });

    it('should parse days correctly', async () => {
      const { parseDuration } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseDuration('1 day')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('2 days')).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('should return 0 for unparseable input', async () => {
      const { parseDuration } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseDuration('sometime')).toBe(0);
      expect(parseDuration('')).toBe(0);
    });
  });

  describe('parseAmount', () => {
    it('should parse dollar amounts', async () => {
      const { parseAmount } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseAmount('$500')).toBe(500);
      expect(parseAmount('$1000.50')).toBe(1000.5);
      expect(parseAmount('set budget to $250')).toBe(250);
    });

    it('should parse USD amounts', async () => {
      const { parseAmount } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseAmount('500 USD')).toBe(500);
      expect(parseAmount('1000 usd')).toBe(1000);
    });

    it('should parse standalone numbers', async () => {
      const { parseAmount } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseAmount('topup 1000')).toBe(1000);
    });
  });

  describe('extractAddress', () => {
    it('should extract Ethereum addresses', async () => {
      const { extractAddress } = await import('@/src/lib/agent/openclaw/parsers');

      const addr = '0x1234567890123456789012345678901234567890';
      expect(extractAddress(`block wallet ${addr}`)).toBe(addr);
      expect(extractAddress(`${addr} is spam`)).toBe(addr);
    });

    it('should return empty string for invalid addresses', async () => {
      const { extractAddress } = await import('@/src/lib/agent/openclaw/parsers');

      expect(extractAddress('block wallet 0x123')).toBe('');
      expect(extractAddress('no address here')).toBe('');
    });
  });

  describe('parseGwei', () => {
    it('should parse gwei values', async () => {
      const { parseGwei } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseGwei('50 gwei')).toBe(50);
      expect(parseGwei('set gas to 100 gwei')).toBe(100);
      expect(parseGwei('max 25 Gwei')).toBe(25);
    });
  });

  describe('parseNumber', () => {
    it('should parse numbers with default', async () => {
      const { parseNumber } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parseNumber('show top 10 users', 5)).toBe(10);
      expect(parseNumber('no numbers here', 7)).toBe(7);
    });
  });

  describe('parsePeriod', () => {
    it('should parse time periods', async () => {
      const { parsePeriod } = await import('@/src/lib/agent/openclaw/parsers');

      expect(parsePeriod('this week')).toBe('week');
      expect(parsePeriod('today')).toBe('day');
      expect(parsePeriod('this month')).toBe('month');
      expect(parsePeriod('random text')).toBe('week'); // default
    });
  });

  describe('extractReason', () => {
    it('should extract reason after keywords', async () => {
      const { extractReason } = await import('@/src/lib/agent/openclaw/parsers');

      expect(extractReason('block wallet 0x... because spam')).toBe('spam');
      expect(extractReason('block 0x... reason: abusive behavior')).toBe('abusive behavior');
      expect(extractReason('block 0x...')).toBeUndefined();
    });
  });
});

describe('Phase 2: Command Parsing', () => {
  describe('parseCommand', () => {
    it('should parse pause_timed commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd1 = parseCommand('pause for 2 hours');
      expect(cmd1.name).toBe('pause_timed');
      expect(parseInt(cmd1.args.durationMs)).toBe(2 * 60 * 60 * 1000);

      const cmd2 = parseCommand('pause until tomorrow');
      expect(cmd2.name).toBe('pause_timed');
    });

    it('should parse set_budget commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd1 = parseCommand('set budget to $500');
      expect(cmd1.name).toBe('set_budget');
      expect(cmd1.args.amountUSD).toBe('500');

      const cmd2 = parseCommand('increase daily cap to 1000 USD');
      expect(cmd2.name).toBe('set_budget');
    });

    it('should parse analytics commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd1 = parseCommand('show top 10 users this week');
      expect(cmd1.name).toBe('analytics');
      expect(cmd1.args.limit).toBe('10');
      expect(cmd1.args.period).toBe('week');

      const cmd2 = parseCommand('analytics');
      expect(cmd2.name).toBe('analytics');
    });

    it('should parse block_wallet commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const addr = '0x1234567890123456789012345678901234567890';
      const cmd = parseCommand(`block wallet ${addr} because spam`);
      expect(cmd.name).toBe('block_wallet');
      expect(cmd.args.wallet).toBe(addr);
      expect(cmd.args.reason).toBe('spam');
    });

    it('should parse set_gas_cap commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd1 = parseCommand('set gas cap to 50 gwei');
      expect(cmd1.name).toBe('set_gas_cap');
      expect(cmd1.args.maxGwei).toBe('50');

      const cmd2 = parseCommand('max gas price 100 gwei');
      expect(cmd2.name).toBe('set_gas_cap');
    });

    it('should parse topup commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd1 = parseCommand('topup 1000');
      expect(cmd1.name).toBe('topup');
      expect(cmd1.args.amountUSD).toBe('1000');

      const cmd2 = parseCommand('deposit $500');
      expect(cmd2.name).toBe('topup');
    });

    it('should fall back to help for unknown commands', async () => {
      const { parseCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = parseCommand('hello world');
      expect(cmd.name).toBe('help');
    });
  });
});

describe('Phase 2: Command Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pause_timed', () => {
    it('should create runtime override for pause', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'pause_timed' as const,
        args: { durationMs: (2 * 60 * 60 * 1000).toString() },
        rawInput: 'pause for 2 hours',
      };

      const result = await executeCommand(cmd as any, 'test-session');

      expect(result.success).toBe(true);
      expect(result.message).toContain('paused');
      expect(result.message).toContain('2h');
    });

    it('should fail without session ID', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'pause_timed' as const,
        args: { durationMs: '3600000' },
        rawInput: 'pause for 1 hour',
      };

      const result = await executeCommand(cmd);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Session ID required');
    });
  });

  describe('set_budget', () => {
    it('should validate budget range', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmdTooHigh = {
        name: 'set_budget' as const,
        args: { amountUSD: '50000' }, // Exceeds $10,000 limit
        rawInput: 'set budget to $50000',
        sessionId: 'test-session',
      };

      const result = await executeCommand(cmdTooHigh as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('$10,000');
    });

    it('should update budget successfully', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'set_budget' as const,
        args: { amountUSD: '500' },
        rawInput: 'set budget to $500',
      };

      const result = await executeCommand(cmd as any, 'test-session');

      expect(result.success).toBe(true);
      expect(result.message).toContain('$500');
    });
  });

  describe('analytics', () => {
    it('should return formatted analytics', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'analytics' as const,
        args: { limit: '10', period: 'week' },
        rawInput: 'show top 10 users this week',
      };

      const result = await executeCommand(cmd as any, 'test-session');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Analytics Summary');
    });
  });

  describe('block_wallet', () => {
    it('should validate wallet address', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'block_wallet' as const,
        args: { wallet: 'invalid', reason: 'spam' },
        rawInput: 'block wallet invalid',
        sessionId: 'test-session',
      };

      const result = await executeCommand(cmd as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid wallet');
    });

    it('should block valid wallet', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'block_wallet' as const,
        args: {
          wallet: '0x1234567890123456789012345678901234567890',
          reason: 'spam',
        },
        rawInput: 'block wallet 0x...',
      };

      const result = await executeCommand(cmd as any, 'test-session');

      expect(result.success).toBe(true);
      expect(result.message).toContain('blocked');
    });
  });

  describe('set_gas_cap', () => {
    it('should validate gas price range', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'set_gas_cap' as const,
        args: { maxGwei: '5000' }, // Exceeds 50 gwei limit for Base
        rawInput: 'set gas cap to 5000 gwei',
        sessionId: 'test-session',
      };

      const result = await executeCommand(cmd as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('50 gwei');
    });

    it('should update gas cap successfully', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'set_gas_cap' as const,
        args: { maxGwei: '50' },
        rawInput: 'set gas cap to 50 gwei',
      };

      const result = await executeCommand(cmd as any, 'test-session');

      expect(result.success).toBe(true);
      expect(result.message).toContain('50 gwei');
    });
  });

  describe('topup', () => {
    it('should validate topup amount', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'topup' as const,
        args: { amountUSD: '0' },
        rawInput: 'topup 0',
        sessionId: 'test-session',
      };

      const result = await executeCommand(cmd as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('greater than $0');
    });

    it('should return deposit instructions', async () => {
      const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

      const cmd = {
        name: 'topup' as const,
        args: { amountUSD: '1000' },
        rawInput: 'topup 1000',
        sessionId: 'test-session',
      };

      const result = await executeCommand(cmd as any);

      expect(result.success).toBe(true);
      expect(result.message).toContain('USDC');
      expect(result.message).toContain('Base');
    });
  });
});

describe('Phase 2: Runtime Overrides CRUD', () => {
  it('should create runtime override', async () => {
    const { createRuntimeOverride } = await import('@/src/lib/protocol/runtime-overrides');

    const result = await createRuntimeOverride({
      protocolId: 'test-protocol',
      overrideType: 'PAUSE_UNTIL',
      value: { until: new Date().toISOString() },
      expiresAt: new Date(Date.now() + 3600000),
      createdBy: 'test',
    });

    expect(result.id).toBeDefined();
  });

  it('should block wallet', async () => {
    const { blockWallet } = await import('@/src/lib/protocol/runtime-overrides');

    const result = await blockWallet({
      protocolId: 'test-protocol',
      walletAddress: '0x1234567890123456789012345678901234567890',
      reason: 'spam',
      blockedBy: 'test',
    });

    expect(result.id).toBeDefined();
  });

  it('should check if wallet is blocked', async () => {
    const { isWalletBlocked } = await import('@/src/lib/protocol/runtime-overrides');

    const blocked = await isWalletBlocked(
      'test-protocol',
      '0x1234567890123456789012345678901234567890'
    );

    expect(typeof blocked).toBe('boolean');
  });
});

describe('Phase 2: Session Manager', () => {
  it('should create and retrieve sessions', async () => {
    const { createOpenClawSession, getProtocolIdFromSession, isSessionValid } = await import(
      '@/src/lib/agent/openclaw/session-manager'
    );

    const session = await createOpenClawSession('session-123', 'test-protocol', 'hash123');

    expect(session.sessionId).toBe('session-123');
    expect(session.protocolId).toBe('test-protocol');
  });
});

describe('Phase 2: Analytics', () => {
  it('should calculate period stats', async () => {
    const { getPeriodStats } = await import('@/src/lib/agent/openclaw/analytics');

    const stats = await getPeriodStats('test-protocol', 'week');

    expect(stats.period).toBe('Last 7 days');
    expect(typeof stats.totalSpentUSD).toBe('number');
    expect(typeof stats.successRate).toBe('number');
  });

  it('should format analytics message', async () => {
    const { formatAnalyticsMessage } = await import('@/src/lib/agent/openclaw/analytics');

    const summary = {
      topWallets: [
        {
          walletAddress: '0x1234567890123456789012345678901234567890',
          totalSpentUSD: 100,
          transactionCount: 50,
          avgCostUSD: 2,
        },
      ],
      periodStats: {
        totalSpentUSD: 500,
        transactionCount: 200,
        successCount: 180,
        failureCount: 20,
        avgCostUSD: 2.5,
        successRate: 90,
        period: 'Last 7 days',
      },
      totalProtocolSpend: 5000,
    };

    const message = formatAnalyticsMessage(summary);

    expect(message).toContain('Analytics Summary');
    expect(message).toContain('Period Spending');
    expect(message).toContain('Top');
    expect(message).toContain('0x1234');
  });
});

describe('Phase 2: Policy Rules with Runtime Overrides', () => {
  it('should check pause override in sponsorship rules', async () => {
    // This is tested via the sponsorship-rules.ts integration
    // The runtime-pause-check rule should block if PAUSE_UNTIL is active
    const { getActiveRuntimeOverride } = await import('@/src/lib/protocol/runtime-overrides');

    const override = await getActiveRuntimeOverride('test-protocol', 'PAUSE_UNTIL');
    expect(override).toBeNull(); // No active pause by default
  });
});

describe('Phase 2: Help Command', () => {
  it('should show categorized help message', async () => {
    const { executeCommand } = await import('@/src/lib/agent/openclaw/command-handler');

    const cmd = {
      name: 'help' as const,
      args: {},
      rawInput: 'help',
    };

    const result = await executeCommand(cmd);

    expect(result.success).toBe(true);
    expect(result.message).toContain('MONITORING');
    expect(result.message).toContain('EXECUTION');
    expect(result.message).toContain('POLICY MANAGEMENT');
    expect(result.message).toContain('FUNDING');
    expect(result.message).toContain('analytics');
    expect(result.message).toContain('set budget');
    expect(result.message).toContain('block wallet');
  });
});
