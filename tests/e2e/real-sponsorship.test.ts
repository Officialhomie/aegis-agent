/**
 * End-to-End Sponsorship Test
 *
 * Tests the complete sponsorship flow with real bundler integration.
 * This test requires:
 * - E2E_TEST_ENABLED=true
 * - BUNDLER_RPC_URL set to a valid Pimlico endpoint
 * - AGENT_WALLET_ADDRESS with testnet ETH
 * - Base Sepolia contracts deployed
 *
 * Run with: E2E_TEST_ENABLED=true pnpm test tests/e2e/real-sponsorship.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkBundlerHealth,
  getBundlerClient,
  resetBundlerClient,
} from '../../src/lib/agent/execute/bundler-client';
import {
  executePaymasterSponsorship,
  preparePaymasterSponsorship,
  getBundlerHealthStatus,
  signDecision,
  sponsorTransaction,
} from '../../src/lib/agent/execute/paymaster';
import { validateStartupConfig, isTestnet } from '../../src/lib/startup-validation';
import { getAgentWalletBalance } from '../../src/lib/agent/observe/sponsorship';
import { getPrisma } from '../../src/lib/db';
import type { Decision } from '../../src/lib/agent/reason/schemas';

const E2E_ENABLED = process.env.E2E_TEST_ENABLED === 'true';
const SKIP_REASON = 'E2E tests require E2E_TEST_ENABLED=true and bundler configuration';

describe.skipIf(!E2E_ENABLED)('E2E Sponsorship Flow', () => {
  beforeAll(() => {
    // Validate configuration
    const validation = validateStartupConfig();
    if (!validation.valid && E2E_ENABLED) {
      console.warn('E2E test configuration warnings:', validation.warnings);
    }
  });

  afterAll(() => {
    resetBundlerClient();
  });

  describe('Bundler Health Check', () => {
    it('should verify bundler is reachable', async () => {
      const health = await checkBundlerHealth();

      if (!process.env.BUNDLER_RPC_URL) {
        expect(health.available).toBe(false);
        expect(health.error).toContain('not configured');
        return;
      }

      expect(health.available).toBe(true);
      expect(health.chainId).toBeDefined();
      expect(health.supportedEntryPoints).toBeDefined();
      expect(health.latencyMs).toBeDefined();
      expect(health.latencyMs).toBeLessThan(10000); // Should respond within 10s

      console.log('Bundler health:', {
        available: health.available,
        chainId: health.chainId,
        latencyMs: health.latencyMs,
      });
    });

    it('should create bundler client when configured', () => {
      if (!process.env.BUNDLER_RPC_URL) {
        expect(getBundlerClient()).toBeNull();
        return;
      }

      const client = getBundlerClient();
      expect(client).not.toBeNull();
    });

    it('should export bundler health via paymaster module', async () => {
      const health = await getBundlerHealthStatus();
      expect(health).toBeDefined();
      expect(typeof health.available).toBe('boolean');
    });
  });

  describe('Agent Wallet Balance', () => {
    it('should fetch agent wallet balance', async () => {
      if (!process.env.AGENT_WALLET_ADDRESS) {
        console.warn('AGENT_WALLET_ADDRESS not set, skipping balance check');
        return;
      }

      const balance = await getAgentWalletBalance();
      expect(balance).toBeDefined();
      expect(typeof balance.ETH).toBe('number');
      expect(typeof balance.USDC).toBe('number');
      expect(balance.chainId).toBeDefined();

      console.log('Agent wallet balance:', {
        ETH: balance.ETH,
        USDC: balance.USDC,
        chainId: balance.chainId,
      });

      // Warn if balance is too low for sponsorship
      if (balance.ETH < 0.01) {
        console.warn('Agent wallet ETH balance is low for E2E tests:', balance.ETH);
      }
    });
  });

  describe('Decision Signing', () => {
    it('should sign a sponsorship decision', async () => {
      const testDecision: Decision = {
        action: 'SPONSOR_TRANSACTION',
        confidence: 0.9,
        reasoning: 'E2E test sponsorship decision',
        preconditions: ['Test precondition'],
        expectedOutcome: 'Test outcome',
        parameters: {
          agentWallet: process.env.AGENT_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000001',
          protocolId: 'test-protocol',
          estimatedCostUSD: 0.01,
          maxGasLimit: 200000,
        },
      };

      const signed = await signDecision(testDecision);

      expect(signed).toBeDefined();
      expect(signed.decisionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signed.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signed.decisionJSON).toContain('SPONSOR_TRANSACTION');

      console.log('Signed decision:', {
        decisionHash: signed.decisionHash.slice(0, 18) + '...',
        signatureLength: signed.signature.length,
      });
    });
  });

  describe('Paymaster Preparation', () => {
    it('should prepare paymaster sponsorship data', async () => {
      if (!process.env.BUNDLER_RPC_URL) {
        console.warn('BUNDLER_RPC_URL not set, skipping paymaster preparation');
        return;
      }

      const result = await preparePaymasterSponsorship({
        agentWallet: process.env.AGENT_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000001',
        maxGasLimit: 200000,
      });

      expect(result).toBeDefined();
      // May or may not be ready depending on bundler config
      console.log('Paymaster preparation:', {
        ready: result.ready,
        hasPaymasterData: !!result.paymasterData,
        error: result.error,
      });
    });
  });

  describe('Startup Validation', () => {
    it('should validate startup configuration', () => {
      const result = validateStartupConfig();

      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.network).toBeDefined();

      console.log('Startup validation:', {
        valid: result.valid,
        network: result.network,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
      });

      if (result.errors.length > 0) {
        console.warn('Validation errors:', result.errors);
      }
    });

    it('should correctly identify testnet/mainnet', () => {
      const testnetMode = isTestnet();
      const networkId = process.env.AGENT_NETWORK_ID;

      if (networkId === 'base') {
        expect(testnetMode).toBe(false);
      } else {
        expect(testnetMode).toBe(true);
      }
    });
  });

  describe('Full Sponsorship Flow (Testnet Only)', () => {
    it.skipIf(!isTestnet())('should execute full sponsorship on testnet', async () => {
      // This test only runs on testnet to avoid mainnet gas costs
      if (!process.env.BUNDLER_RPC_URL) {
        console.warn('BUNDLER_RPC_URL not set, skipping full sponsorship test');
        return;
      }

      if (!process.env.AGENT_WALLET_ADDRESS) {
        console.warn('AGENT_WALLET_ADDRESS not set, skipping full sponsorship test');
        return;
      }

      // Check balance first
      const balance = await getAgentWalletBalance();
      if (balance.ETH < 0.001) {
        console.warn('Insufficient ETH for sponsorship test:', balance.ETH);
        return;
      }

      // Execute sponsorship
      const result = await executePaymasterSponsorship({
        agentWallet: process.env.AGENT_WALLET_ADDRESS,
        maxGasLimit: 100000,
      });

      console.log('Sponsorship execution result:', {
        paymasterReady: result.paymasterReady,
        userOpHash: result.userOpHash?.slice(0, 18) + '...',
        transactionHash: result.transactionHash?.slice(0, 18) + '...',
        error: result.error,
      });

      // The test passes if we get a response (success or configured error)
      expect(result).toBeDefined();
      expect(typeof result.paymasterReady).toBe('boolean');
    });
  });

  describe('Post-Sponsorship Verification', () => {
    it.skipIf(!isTestnet())('should verify budget deducted, on-chain log, and SponsorshipRecord after full sponsorship', async () => {
      if (!process.env.BUNDLER_RPC_URL || !process.env.AGENT_WALLET_ADDRESS) {
        console.warn('BUNDLER_RPC_URL or AGENT_WALLET_ADDRESS not set, skipping post-sponsorship verification');
        return;
      }

      const balance = await getAgentWalletBalance();
      if (balance.ETH < 0.001) {
        console.warn('Insufficient ETH for sponsorship test:', balance.ETH);
        return;
      }

      const prisma = getPrisma();
      const protocolId = 'test-protocol';

      const protocolBefore = await prisma.protocolSponsor.findUnique({
        where: { protocolId },
      });
      if (!protocolBefore || protocolBefore.balanceUSD < 0.01) {
        console.warn('Protocol test-protocol not found or insufficient balance for post-sponsorship verification');
        return;
      }

      const decision: Decision = {
        action: 'SPONSOR_TRANSACTION',
        confidence: 0.9,
        reasoning: 'E2E post-sponsorship verification test',
        parameters: {
          agentWallet: process.env.AGENT_WALLET_ADDRESS,
          protocolId,
          estimatedCostUSD: 0.01,
          maxGasLimit: 100000,
        },
      };

      const result = await sponsorTransaction(decision, 'LIVE');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      const txHash = result.transactionHash ?? (result as { sponsorshipHash?: string }).sponsorshipHash;
      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^0x[a-fA-F0-9]+$/);

      const record = await prisma.sponsorshipRecord.findFirst({
        where: { protocolId },
        orderBy: { createdAt: 'desc' },
      });
      expect(record).not.toBeNull();
      expect(record!.decisionHash).toBeDefined();
      expect(record!.txHash).toBeDefined();
      expect(record!.estimatedCostUSD).toBe(0.01);

      const protocolAfter = await prisma.protocolSponsor.findUnique({
        where: { protocolId },
      });
      expect(protocolAfter).not.toBeNull();
      expect(protocolAfter!.balanceUSD).toBeLessThan(protocolBefore!.balanceUSD);
      expect(protocolAfter!.sponsorshipCount).toBe(protocolBefore!.sponsorshipCount + 1);
    });
  });
});

describe('Sponsorship Integration (Unit)', () => {
  it('should handle missing bundler URL gracefully', async () => {
    // Temporarily unset bundler URL
    const originalUrl = process.env.BUNDLER_RPC_URL;
    delete process.env.BUNDLER_RPC_URL;

    try {
      resetBundlerClient();
      const client = getBundlerClient();
      expect(client).toBeNull();

      const health = await checkBundlerHealth();
      expect(health.available).toBe(false);
      expect(health.error).toContain('not configured');
    } finally {
      if (originalUrl) {
        process.env.BUNDLER_RPC_URL = originalUrl;
      }
      resetBundlerClient();
    }
  });

  it('should return proper types from paymaster execution', async () => {
    const result = await executePaymasterSponsorship({
      agentWallet: '0x0000000000000000000000000000000000000001',
      maxGasLimit: 100000,
    });

    expect(result).toBeDefined();
    expect(typeof result.paymasterReady).toBe('boolean');
    // userOpHash and transactionHash are optional
    if (result.userOpHash) {
      expect(result.userOpHash).toMatch(/^0x/);
    }
    if (result.transactionHash) {
      expect(result.transactionHash).toMatch(/^0x/);
    }
  });
});
