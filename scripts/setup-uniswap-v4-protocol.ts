/**
 * Register or update the "uniswap-v4" protocol in the database for targeted sponsorship campaigns.
 * Idempotent: safe to run multiple times.
 *
 * Usage: npx tsx scripts/setup-uniswap-v4-protocol.ts
 */

import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import { CONTRACTS } from '../src/lib/agent/contracts/addresses';

const PROTOCOL_ID = 'uniswap-v4';
const PROTOCOL_NAME = 'Uniswap V4';
/** Initial budget for campaign use (e.g. 10 txs at ~$0.50 each) */
const INITIAL_BALANCE_USD = 50;
/** Simulation mode for 365 days so campaigns can run without CDP approval */
const SIMULATION_DAYS = 365;

async function main() {
  const db = getPrisma();
  const v4 = CONTRACTS.base.uniswapV4;
  const whitelistedContracts = [
    v4.poolManager,
    v4.positionManager,
    v4.universalRouter,
    v4.quoter,
    v4.stateView,
    v4.permit2,
  ];

  const simulationModeUntil = new Date(Date.now() + SIMULATION_DAYS * 24 * 60 * 60 * 1000);

  const existing = await db.protocolSponsor.findUnique({
    where: { protocolId: PROTOCOL_ID },
  });

  if (existing) {
    await db.protocolSponsor.update({
      where: { protocolId: PROTOCOL_ID },
      data: {
        name: PROTOCOL_NAME,
        whitelistedContracts,
        simulationModeUntil,
        updatedAt: new Date(),
      },
    });
    console.log('[Setup] Updated protocol', PROTOCOL_ID, 'whitelist and simulation window');
  } else {
    await db.protocolSponsor.create({
      data: {
        protocolId: PROTOCOL_ID,
        name: PROTOCOL_NAME,
        whitelistedContracts,
        tier: 'bronze',
        balanceUSD: INITIAL_BALANCE_USD,
        totalSpent: 0,
        sponsorshipCount: 0,
        onboardingStatus: 'APPROVED_SIMULATION',
        cdpAllowlistStatus: 'NOT_SUBMITTED',
        simulationModeUntil,
        notificationEmail: null,
        notificationWebhook: null,
        apiKeyHash: null,
        apiKeyCreatedAt: null,
      },
    });
    console.log('[Setup] Created protocol', PROTOCOL_ID, 'with balance', INITIAL_BALANCE_USD, 'USD');
  }

  const protocol = await db.protocolSponsor.findUnique({
    where: { protocolId: PROTOCOL_ID },
  });
  console.log('  Whitelisted contracts:', whitelistedContracts.length);
  console.log('  Simulation until:', simulationModeUntil.toISOString());
  console.log('  Balance USD:', protocol?.balanceUSD);
  console.log('Done.');
  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
