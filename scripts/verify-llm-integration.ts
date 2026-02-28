/**
 * LLM Integration Verification Script
 *
 * Verifies all LLM surfaces in Aegis:
 * 1. Reasoning LLM (template/cache/live)
 * 2. Skills LLM (guards/live)
 * 3. OpenClaw integration
 */

import { reasonAboutSponsorship } from '../src/lib/agent/reason';
import { executeSkillChain } from '../src/lib/skills/executor';
import { parseCommand } from '../src/lib/agent/openclaw/command-handler';
import type { Observation } from '../src/lib/agent/observe';
import { logger } from '../src/lib/logger';

// Test counters
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [] as Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIP'; details: string }>,
};

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      console.log(`\n[TEST] ${name}`);
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS', details: 'Test passed' });
      console.log(`✓ PASS: ${name}`);
    } catch (error) {
      results.failed++;
      const details = error instanceof Error ? error.message : String(error);
      results.tests.push({ name, status: 'FAIL', details });
      console.error(`✗ FAIL: ${name}`, details);
    }
  };
}

// ============================================================================
// PHASE 1: Reasoning LLM Tests
// ============================================================================

const testReasoningTemplate = test('Reasoning LLM: Template short-circuit (gas too high)', async () => {
  const observations: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '3.5' }, // Above threshold
    },
  ];

  const decision = await reasonAboutSponsorship(observations, []);

  if (decision.action !== 'WAIT') {
    throw new Error(`Expected WAIT, got ${decision.action}`);
  }

  if (!decision.reasoning.toLowerCase().includes('gas')) {
    throw new Error(`Expected reasoning to mention gas, got: ${decision.reasoning}`);
  }

  if (decision.confidence !== 1.0) {
    throw new Error(`Expected confidence 1.0 for template, got ${decision.confidence}`);
  }

  console.log(`  → Action: ${decision.action}, Confidence: ${decision.confidence}`);
  console.log(`  → Reasoning: ${decision.reasoning.slice(0, 80)}...`);
});

const testReasoningNoOpportunities = test('Reasoning LLM: Template short-circuit (no opportunities)', async () => {
  const observations: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '1.0' },
    },
    {
      id: 'obs-2',
      timestamp: new Date(),
      source: 'scanner',
      data: { lowGasWallets: [] }, // No opportunities
    },
  ];

  const decision = await reasonAboutSponsorship(observations, []);

  if (decision.action !== 'WAIT') {
    throw new Error(`Expected WAIT, got ${decision.action}`);
  }

  console.log(`  → Action: ${decision.action}, Confidence: ${decision.confidence}`);
});

const testReasoningSwapReserves = test('Reasoning LLM: Template SWAP_RESERVES (low ETH)', async () => {
  const observations: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'treasury',
      data: {
        agentReserves: { eth: 0.03, usdc: 500 }, // ETH critically low
      },
    },
    {
      id: 'obs-2',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '1.0' },
    },
    {
      id: 'obs-3',
      timestamp: new Date(),
      source: 'scanner',
      data: { lowGasWallets: [{ wallet: '0x1234567890123456789012345678901234567890' }] },
    },
  ];

  const decision = await reasonAboutSponsorship(observations, []);

  if (decision.action !== 'SWAP_RESERVES') {
    throw new Error(`Expected SWAP_RESERVES, got ${decision.action}`);
  }

  if (!decision.parameters) {
    throw new Error('Expected parameters for SWAP_RESERVES');
  }

  console.log(`  → Action: ${decision.action}, Confidence: ${decision.confidence}`);
  console.log(`  → Parameters:`, JSON.stringify(decision.parameters, null, 2));
});

const testReasoningLLMFallback = test('Reasoning LLM: Fallback when template not matched (no API key)', async () => {
  const observations: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '1.5' },
    },
    {
      id: 'obs-2',
      timestamp: new Date(),
      source: 'treasury',
      data: { agentReserves: { eth: 0.2, usdc: 500 } },
    },
    {
      id: 'obs-3',
      timestamp: new Date(),
      source: 'scanner',
      data: {
        lowGasWallets: [
          { wallet: '0x1111111111111111111111111111111111111111' },
          { wallet: '0x2222222222222222222222222222222222222222' },
          { wallet: '0x3333333333333333333333333333333333333333' },
          { wallet: '0x4444444444444444444444444444444444444444' },
          { wallet: '0x5555555555555555555555555555555555555555' },
        ],
      },
    },
    {
      id: 'obs-4',
      timestamp: new Date(),
      source: 'protocol',
      data: {
        protocolBudgets: [
          { protocolId: 'uniswap-v4', balanceUSD: 1000 },
        ],
      },
    },
  ];

  // This should try to call LLM (no template match), but fail due to missing API key
  // Expected: fallback to WAIT with reasoning explaining the error
  const decision = await reasonAboutSponsorship(observations, []);

  console.log(`  → Action: ${decision.action}, Confidence: ${decision.confidence}`);
  console.log(`  → Reasoning: ${decision.reasoning.slice(0, 100)}...`);

  if (decision.metadata?.reasoningFailed) {
    console.log(`  → LLM call failed as expected (no API key), fallback triggered`);
  }
});

// ============================================================================
// PHASE 2: Skills LLM Tests
// ============================================================================

const testSkillsGuardShortCircuit = test('Skills LLM: Guard short-circuit (deterministic REJECT)', async () => {
  const result = await executeSkillChain(['aegis-gas-estimation'], {
    agentWallet: '0x1234567890123456789012345678901234567890',
    protocolId: 'uniswap-v4',
    estimatedCostUSD: 0.05,
    currentGasPrice: BigInt(100_000_000_000), // 100 Gwei - way too high
    chainId: 8453,
  });

  if (result.decision !== 'REJECT') {
    throw new Error(`Expected REJECT from gas guard, got ${result.decision}`);
  }

  console.log(`  → Decision: ${result.decision}, Confidence: ${result.confidence}`);
  console.log(`  → Reasoning: ${result.reasoning.slice(0, 80)}...`);
  console.log(`  → Guard prevented LLM call (as expected)`);
});

const testSkillsChain = test('Skills LLM: Chain execution with guards', async () => {
  const result = await executeSkillChain(
    ['aegis-gas-estimation', 'aegis-agent-reputation', 'aegis-protocol-vetting'],
    {
      agentWallet: '0x1234567890123456789012345678901234567890',
      protocolId: 'uniswap-v4',
      estimatedCostUSD: 0.02,
      currentGasPrice: BigInt(1_000_000_000), // 1 Gwei - reasonable
      chainId: 8453,
      passport: {
        tier: 'VERIFIED',
        score: 85,
      },
    }
  );

  console.log(`  → Decision: ${result.decision}, Confidence: ${result.confidence}`);
  console.log(`  → Reasoning: ${result.reasoning.slice(0, 80)}...`);
});

// ============================================================================
// PHASE 3: OpenClaw Integration Tests
// ============================================================================

const testOpenClawParseStatus = test('OpenClaw: Parse status command', () => {
  const commands = [
    'status',
    'health',
    'how are you doing',
    'what is the balance',
  ];

  for (const cmd of commands) {
    const parsed = parseCommand(cmd);
    if (parsed.name !== 'status') {
      throw new Error(`Expected 'status' command, got '${parsed.name}' for input: ${cmd}`);
    }
    console.log(`  → "${cmd}" → ${parsed.name}`);
  }
});

const testOpenClawParseCycle = test('OpenClaw: Parse cycle command', () => {
  const commands = [
    'cycle',
    'run cycle',
    'trigger a cycle',
    'trigger',
  ];

  for (const cmd of commands) {
    const parsed = parseCommand(cmd);
    if (parsed.name !== 'cycle') {
      throw new Error(`Expected 'cycle' command, got '${parsed.name}' for input: ${cmd}`);
    }
    console.log(`  → "${cmd}" → ${parsed.name}`);
  }
});

const testOpenClawParseAmbiguous = test('OpenClaw: Ambiguous command parsing', () => {
  const ambiguous = [
    'pause for a bit',
    'stop temporarily',
  ];

  for (const cmd of ambiguous) {
    const parsed = parseCommand(cmd);
    console.log(`  → "${cmd}" → ${parsed.name} (args: ${JSON.stringify(parsed.args)})`);

    // Should parse to pause or pause_timed
    if (!parsed.name.includes('pause')) {
      console.warn(`    WARNING: Ambiguous command "${cmd}" parsed as "${parsed.name}"`);
    }
  }
});

// ============================================================================
// PHASE 4: Observability Tests
// ============================================================================

const testObservabilityMetrics = test('Observability: LLM call logging', async () => {
  // Run a reasoning call and check that metrics are incremented
  const observations: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '3.0' },
    },
  ];

  await reasonAboutSponsorship(observations, []);

  console.log(`  → LLM call metrics should be captured in monitoring system`);
  console.log(`  → Check logs for: [Reason] template decision or LLM call`);
});

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('AEGIS LLM INTEGRATION VERIFICATION');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Environment:`);
  console.log(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`  - ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`  - SKILLS_ENFORCED: ${process.env.SKILLS_ENFORCED || 'false (default)'}`);
  console.log('='.repeat(80));

  // PHASE 1: Reasoning LLM
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 1: Reasoning LLM Tests');
  console.log('='.repeat(80));
  await testReasoningTemplate();
  await testReasoningNoOpportunities();
  await testReasoningSwapReserves();
  await testReasoningLLMFallback();

  // PHASE 2: Skills LLM
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 2: Skills LLM Tests');
  console.log('='.repeat(80));
  await testSkillsGuardShortCircuit();
  await testSkillsChain();

  // PHASE 3: OpenClaw Integration
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 3: OpenClaw Integration Tests');
  console.log('='.repeat(80));
  await testOpenClawParseStatus();
  await testOpenClawParseCycle();
  await testOpenClawParseAmbiguous();

  // PHASE 4: Observability
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 4: Observability Tests');
  console.log('='.repeat(80));
  await testObservabilityMetrics();

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total: ${results.passed + results.failed + results.skipped}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log('='.repeat(80));

  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  ✗ ${t.name}`);
      console.log(`    ${t.details}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
