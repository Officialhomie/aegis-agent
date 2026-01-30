/**
 * Observation layer tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observeBlockchainState } from '../../src/lib/agent/observe/blockchain';
import { getTokenBalances, observeTreasuryState } from '../../src/lib/agent/observe/treasury';
import { getPrice, getCoinGeckoPrice } from '../../src/lib/agent/observe/oracles';
import { observe } from '../../src/lib/agent/observe';

describe('Observation Layer', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org');
  });

  it('should export observe function', () => {
    expect(typeof observe).toBe('function');
  });

  it('should return observations array from observe()', async () => {
    const result = await observe();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should have observeBlockchainState function', () => {
    expect(typeof observeBlockchainState).toBe('function');
  });

  it('should return token balance structure from getTokenBalances when no RPC', async () => {
    const result = await getTokenBalances('0x0000000000000000000000000000000000000001');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return treasury state shape from observeTreasuryState', async () => {
    const result = await observeTreasuryState('0x0000000000000000000000000000000000000001');
    expect(result).toHaveProperty('tokens');
    expect(result).toHaveProperty('positions');
    expect(result).toHaveProperty('governance');
    expect(result).toHaveProperty('riskMetrics');
    expect(Array.isArray(result.tokens)).toBe(true);
  });

  it('should handle RPC failures gracefully in observe', async () => {
    vi.stubEnv('BASE_SEPOLIA_RPC_URL', '');
    const result = await observe();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('Oracle / Price', () => {
  it('should have getPrice and getCoinGeckoPrice', () => {
    expect(typeof getPrice).toBe('function');
    expect(typeof getCoinGeckoPrice).toBe('function');
  });

  it('should return null or result from getCoinGeckoPrice for ETH/USD', async () => {
    const result = await getCoinGeckoPrice('ETH/USD');
    if (result) {
      expect(result).toHaveProperty('pair', 'ETH/USD');
      expect(result).toHaveProperty('price');
      expect(result).toHaveProperty('source', 'coingecko');
    }
  });
});
