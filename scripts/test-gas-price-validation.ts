/**
 * Gas Price Validation Test Script
 *
 * Tests that the gas-price-optimization rule correctly rejects UserOps
 * when gas price exceeds MAX_GAS_PRICE_GWEI.
 *
 * Usage:
 *   npx tsx scripts/test-gas-price-validation.ts
 */

import 'dotenv/config';
import { sponsorshipPolicyRules } from '../src/lib/agent/policy/sponsorship-rules';
import type { Decision } from '../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../src/lib/agent';

interface TestCase {
  name: string;
  gasPrice: number;
  maxGasPrice?: number;
  expectedResult: boolean;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'Gas price within limit',
    gasPrice: 1.5,
    expectedResult: true,
    description: 'Should PASS when gas price (1.5 gwei) < MAX (2 gwei)',
  },
  {
    name: 'Gas price at exact limit',
    gasPrice: 2.0,
    expectedResult: false,
    description: 'Should FAIL when gas price (2.0 gwei) >= MAX (2 gwei)',
  },
  {
    name: 'Gas price above limit',
    gasPrice: 10.0,
    expectedResult: false,
    description: 'Should FAIL when gas price (10 gwei) > MAX (2 gwei)',
  },
  {
    name: 'Very high gas price',
    gasPrice: 100.0,
    expectedResult: false,
    description: 'Should FAIL when gas price (100 gwei) >> MAX (2 gwei)',
  },
  {
    name: 'Custom max gas price',
    gasPrice: 5.0,
    maxGasPrice: 10.0,
    expectedResult: true,
    description: 'Should PASS when gas price (5 gwei) < custom MAX (10 gwei)',
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  // Create a mock sponsorship decision
  const mockDecision: Decision = {
    action: 'SPONSOR_TRANSACTION' as const,
    reasoning: 'Test sponsorship for gas price validation',
    confidence: 1.0,
    parameters: {
      targetWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'test-protocol',
      chainName: 'base' as const,
      estimatedCostUSD: 0.01,
    },
  };

  // Create mock config with test gas price
  const mockConfig: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'SIMULATION' as const,
    currentGasPriceGwei: testCase.gasPrice,
    gasPriceMaxGwei: testCase.maxGasPrice,
  };

  // Find the gas-price-optimization rule
  const gasPriceRule = sponsorshipPolicyRules.find((r) => r.name === 'gas-price-optimization');

  if (!gasPriceRule) {
    throw new Error('gas-price-optimization rule not found');
  }

  // Execute the rule
  const result = await gasPriceRule.validate(mockDecision, mockConfig);

  // Check if result matches expectation
  const passed = result.passed === testCase.expectedResult;

  return passed;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           GAS PRICE VALIDATION TEST SUITE                 ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`MAX_GAS_PRICE_GWEI from env: ${process.env.MAX_GAS_PRICE_GWEI ?? 'not set'}`);
  console.log(`GAS_PRICE_MAX_GWEI from env: ${process.env.GAS_PRICE_MAX_GWEI ?? 'not set'}`);
  console.log('');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`Test ${totalTests}: ${testCase.name}`);
    console.log(`  ${testCase.description}`);

    try {
      const passed = await runTest(testCase);

      if (passed) {
        console.log(`  ✅ PASSED`);
        passedTests++;
      } else {
        console.log(`  ❌ FAILED - Expected ${testCase.expectedResult ? 'PASS' : 'FAIL'} but got opposite`);
        failedTests++;
      }
    } catch (error) {
      console.log(`  ❌ ERROR - ${error instanceof Error ? error.message : String(error)}`);
      failedTests++;
    }

    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      TEST SUMMARY                          ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Tests:  ${totalTests}`);
  console.log(`Passed:       ${passedTests}`);
  console.log(`Failed:       ${failedTests}`);
  console.log('');

  if (failedTests === 0) {
    console.log('✅ ALL TESTS PASSED - Gas price validation is working correctly!');
    console.log('');
    console.log('Gas price hardening is ENFORCED:');
    console.log(`  - MAX_GAS_PRICE_GWEI = 2 gwei`);
    console.log(`  - UserOps with gas price >= 2 gwei will be REJECTED`);
    console.log(`  - UserOps with gas price < 2 gwei will be ACCEPTED`);
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED - Gas price validation may not be working as expected');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
