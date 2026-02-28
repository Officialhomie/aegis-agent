/**
 * Live LLM Integration Test
 * Tests actual Anthropic API calls with real credentials
 */

import 'dotenv/config';
import { reasonAboutSponsorship } from '../src/lib/agent/reason';
import type { Observation } from '../src/lib/agent/observe';

async function testLiveLLM() {
  console.log('='.repeat(80));
  console.log('LIVE LLM INTEGRATION TEST');
  console.log('='.repeat(80));
  console.log('USE_CLAUDE_REASONING:', process.env.USE_CLAUDE_REASONING);
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? `SET (${process.env.ANTHROPIC_API_KEY.length} chars)` : 'NOT SET');
  console.log('='.repeat(80));

  // Test 1: Template response (should NOT call LLM)
  console.log('\n[TEST 1] Template Response - Gas Too High (no LLM call expected)');
  const obs1: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '3.5' },
    },
  ];

  try {
    const decision1 = await reasonAboutSponsorship(obs1, []);
    console.log('✅ Result:');
    console.log('  Action:', decision1.action);
    console.log('  Confidence:', decision1.confidence);
    console.log('  Reasoning:', decision1.reasoning.slice(0, 100) + '...');
    console.log('  Template:', decision1.metadata?.template || 'N/A');
  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Test 2: Live LLM call (should call Anthropic)
  console.log('\n[TEST 2] Live LLM Call - Complex Scenario (LLM call expected)');
  const obs2: Observation[] = [
    {
      id: 'obs-1',
      timestamp: new Date(),
      source: 'blockchain',
      data: { gasPriceGwei: '1.5' }, // Below threshold
    },
    {
      id: 'obs-2',
      timestamp: new Date(),
      source: 'treasury',
      data: { agentReserves: { eth: 0.2, usdc: 500 } }, // Healthy reserves
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
        protocolBudgets: [{ protocolId: 'uniswap-v4', balanceUSD: 1000 }],
      },
    },
  ];

  try {
    console.log('Calling Anthropic Claude API...');
    const start = Date.now();
    const decision2 = await reasonAboutSponsorship(obs2, []);
    const duration = Date.now() - start;

    console.log('✅ SUCCESS - Live LLM Response:');
    console.log('  Duration:', duration + 'ms');
    console.log('  Action:', decision2.action);
    console.log('  Confidence:', decision2.confidence);
    console.log('  Reasoning:', decision2.reasoning);
    console.log('  Parameters:', JSON.stringify(decision2.parameters, null, 2));

    if (decision2.metadata?.reasoningFailed) {
      console.log('  ⚠️ Reasoning Failed:', decision2.metadata.error);
    } else {
      console.log('  ✅ LLM call successful!');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

testLiveLLM().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
