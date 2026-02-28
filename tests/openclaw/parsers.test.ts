/**
 * OpenClaw Parser Tests
 *
 * Tests for natural language parsing functions used by OpenClaw commands.
 */

import { describe, it, expect } from 'vitest';
import {
  extractAddress,
  parseMoneyExtended,
  parseInterval,
  parseId,
  parseStatusFilter,
  parseProtocolId,
  parseDate,
  parseFormat,
  parseHours,
  parseAgentType,
  parseServiceTier,
  parseConfirmation,
  validateAddressChecksum,
  parseDuration,
} from '../../src/lib/agent/openclaw/parsers';

describe('extractAddress', () => {
  it('extracts a valid Ethereum address', () => {
    expect(extractAddress('agent 0x1234567890abcdef1234567890abcdef12345678'))
      .toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('extracts address from middle of string', () => {
    expect(extractAddress('approve 0xABCDEF1234567890abcdef1234567890ABCDEF12 tier 2'))
      .toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
  });

  it('returns empty string for no address', () => {
    expect(extractAddress('no address here')).toBe('');
  });

  it('returns empty string for partial address', () => {
    expect(extractAddress('0x123456')).toBe('');
  });

  it('handles mixed case addresses', () => {
    expect(extractAddress('user 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'))
      .toBe('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12');
  });
});

describe('parseMoneyExtended', () => {
  it('parses dollar amount with $ prefix', () => {
    expect(parseMoneyExtended('budget $100')).toBe(100);
  });

  it('parses dollar amount with comma separators', () => {
    expect(parseMoneyExtended('budget $1,500')).toBe(1500);
  });

  it('parses decimal amounts', () => {
    expect(parseMoneyExtended('budget $99.99')).toBe(99.99);
  });

  it('parses amount with USD suffix', () => {
    expect(parseMoneyExtended('budget 500 USD')).toBe(500);
  });

  it('parses k shorthand', () => {
    expect(parseMoneyExtended('budget $2.5k')).toBe(2500);
  });

  it('parses plain number', () => {
    expect(parseMoneyExtended('budget 250')).toBe(250);
  });

  it('returns 0 for no amount', () => {
    expect(parseMoneyExtended('no amount here')).toBe(0);
  });
});

describe('parseDuration', () => {
  it('parses days', () => {
    expect(parseDuration('duration 7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('parses days with "days" word', () => {
    expect(parseDuration('duration 14 days')).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseDuration('for 24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses hours with "hours" word', () => {
    expect(parseDuration('for 6 hours')).toBe(6 * 60 * 60 * 1000);
  });

  it('parses minutes', () => {
    expect(parseDuration('for 15m')).toBe(15 * 60 * 1000);
  });

  it('parses minutes with "min" word', () => {
    expect(parseDuration('for 30 min')).toBe(30 * 60 * 1000);
  });

  it('returns default (1h) for no duration', () => {
    // parseDuration defaults to 1 hour when no duration found
    expect(parseDuration('no duration here')).toBe(60 * 60 * 1000);
  });
});

describe('parseInterval', () => {
  it('parses minutes with "every"', () => {
    expect(parseInterval('every 15m')).toBe(15 * 60 * 1000);
  });

  it('parses hours with "every"', () => {
    expect(parseInterval('every 24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('returns default for no interval', () => {
    const defaultMs = 900000;
    expect(parseInterval('no interval here', defaultMs)).toBe(defaultMs);
  });
});

describe('parseId', () => {
  it('extracts CUID-style ID', () => {
    expect(parseId('get delegation clabcdefghij1234567890')).toBe('clabcdefghij1234567890');
  });

  it('extracts ID after keyword', () => {
    expect(parseId('cancel guarantee abc123')).toBe('abc123');
  });

  it('returns null when no ID found', () => {
    expect(parseId('no id')).toBeNull();
  });
});

describe('parseStatusFilter', () => {
  it('parses active status', () => {
    expect(parseStatusFilter('list agents active')).toBe('ACTIVE');
  });

  it('parses revoked status', () => {
    expect(parseStatusFilter('list delegations revoked')).toBe('REVOKED');
  });

  it('parses expired status', () => {
    expect(parseStatusFilter('list guarantees expired')).toBe('EXPIRED');
  });

  it('parses pending status', () => {
    expect(parseStatusFilter('list guarantees pending')).toBe('PENDING');
  });

  it('is case insensitive', () => {
    expect(parseStatusFilter('list ACTIVE')).toBe('ACTIVE');
  });

  it('returns null for no status', () => {
    expect(parseStatusFilter('list agents')).toBeNull();
  });
});

describe('parseProtocolId', () => {
  it('extracts protocol ID after "protocol" keyword', () => {
    const result = parseProtocolId('get protocol uniswap-v4');
    expect(result).toBe('uniswap-v4');
  });

  it('extracts protocol ID with numbers', () => {
    const result = parseProtocolId('get protocol aave-v3');
    expect(result).toBe('aave-v3');
  });

  it('returns null for no protocol keyword', () => {
    expect(parseProtocolId('show budget')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses ISO date format', () => {
    const result = parseDate('since 2026-02-01');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns null for no date', () => {
    expect(parseDate('no date here')).toBeNull();
  });
});

describe('parseFormat', () => {
  it('parses csv format', () => {
    expect(parseFormat('export format csv')).toBe('csv');
  });

  it('parses json format', () => {
    expect(parseFormat('export format json')).toBe('json');
  });

  it('returns default for unknown format', () => {
    expect(parseFormat('export data', 'csv')).toBe('csv');
  });
});

describe('parseHours', () => {
  it('parses hours with h suffix', () => {
    expect(parseHours('last 24h')).toBe(24);
  });

  it('parses hours with "hours" word', () => {
    expect(parseHours('last 48 hours')).toBe(48);
  });

  it('returns default for no hours', () => {
    expect(parseHours('last week', 24)).toBe(24);
  });
});

describe('parseAgentType', () => {
  it('parses ERC8004_AGENT', () => {
    expect(parseAgentType('type ERC8004_AGENT')).toBe('ERC8004_AGENT');
  });

  it('parses ERC4337_ACCOUNT', () => {
    expect(parseAgentType('type ERC4337_ACCOUNT')).toBe('ERC4337_ACCOUNT');
  });

  it('parses SMART_CONTRACT', () => {
    expect(parseAgentType('type SMART_CONTRACT')).toBe('SMART_CONTRACT');
  });

  it('parses EOA', () => {
    expect(parseAgentType('type EOA')).toBe('EOA');
  });

  it('is case insensitive', () => {
    expect(parseAgentType('type erc8004_agent')).toBe('ERC8004_AGENT');
  });

  it('returns null for unknown type', () => {
    expect(parseAgentType('type unknown')).toBeNull();
  });
});

describe('parseServiceTier', () => {
  it('parses BRONZE', () => {
    expect(parseServiceTier('tier bronze')).toBe('BRONZE');
  });

  it('parses SILVER', () => {
    expect(parseServiceTier('tier silver')).toBe('SILVER');
  });

  it('parses GOLD', () => {
    expect(parseServiceTier('tier gold')).toBe('GOLD');
  });

  it('is case insensitive', () => {
    expect(parseServiceTier('tier GOLD')).toBe('GOLD');
  });

  it('returns null for unknown tier', () => {
    expect(parseServiceTier('tier platinum')).toBeNull();
  });
});

describe('parseConfirmation', () => {
  it('detects YES confirmation', () => {
    const result = parseConfirmation('YES');
    expect(result.confirmed).toBe(true);
  });

  it('detects confirm keyword', () => {
    const result = parseConfirmation('confirm abc123');
    expect(result.confirmed).toBe(true);
    expect(result.token).toBe('abc123');
  });

  it('detects CONFIRM keyword', () => {
    const result = parseConfirmation('CONFIRM token456');
    expect(result.confirmed).toBe(true);
    expect(result.token).toBe('token456');
  });

  it('returns false for other input', () => {
    const result = parseConfirmation('cancel');
    expect(result.confirmed).toBe(false);
  });
});

describe('validateAddressChecksum', () => {
  it('accepts valid checksummed address', () => {
    expect(validateAddressChecksum('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
  });

  it('accepts lowercase address', () => {
    expect(validateAddressChecksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(true);
  });

  it('accepts uppercase address', () => {
    // Implementation accepts all valid format addresses for simplicity
    expect(validateAddressChecksum('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED')).toBe(true);
  });

  it('rejects invalid address length', () => {
    expect(validateAddressChecksum('0x5aAeb6053F3E94C9b9A09f33669435E7')).toBe(false);
  });
});
