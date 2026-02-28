/**
 * Agent Tier Migration Script
 *
 * Classifies all existing SponsorshipRecords and ApprovedAgents with tier data.
 * Uses account-validator to assign tiers based on ERC-8004/ERC-4337 validation.
 *
 * Tier System:
 * - Tier 1 (PRIORITY): ERC-8004 registered agents
 * - Tier 2 (STANDARD): ERC-4337 smart accounts
 * - Tier 3 (FALLBACK): Other smart contracts
 * - Tier 0 (REJECTED): EOAs - never persisted
 *
 * Run in order (after schema has agent tier columns).
 * IMPORTANT: Run from the app root (directory that has package.json, prisma/, and .env).
 *   1. npm run db:migrate -- --name add_agent_tiers   # if columns not yet in DB
 *   2. npm run db:migrate-agent-tiers                 # or: npx tsx scripts/migrate-agent-tiers.ts
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-tiers.ts
 *   npx tsx scripts/migrate-agent-tiers.ts --dry-run
 *   npx tsx scripts/migrate-agent-tiers.ts --chain baseSepolia
 */

import 'dotenv/config';
import { AgentType } from '@prisma/client';
import { getPrisma } from '../src/lib/db';
import { validateAccount } from '../src/lib/agent/validation/account-validator';
import type { Address } from 'viem';

const prisma = getPrisma();

interface MigrationStats {
  totalAddresses: number;
  sponsorshipRecordsUpdated: number;
  approvedAgentsUpdated: number;
  tierDistribution: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier0: number; // Should be 0 - EOAs rejected
    unknown: number;
  };
  errors: Array<{
    address: string;
    error: string;
  }>;
}

interface TierData {
  agentTier: number;
  agentType: AgentType;
  isERC8004: boolean;
  isERC4337: boolean;
}

function parseArgs(): {
  chain: 'base' | 'baseSepolia';
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let chain: 'base' | 'baseSepolia' = 'base';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chain' && args[i + 1]) {
      chain = args[++i] as 'base' | 'baseSepolia';
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { chain, dryRun };
}

async function classifyAddress(
  address: Address,
  chain: 'base' | 'baseSepolia'
): Promise<TierData> {
  try {
    const validation = await validateAccount(address, chain);

    // Determine tier based on validation
    let agentTier: number;
    let agentType: AgentType;
    let isERC8004 = false;
    let isERC4337 = false;

    if (!validation.isValid) {
      // EOA - Tier 0 (should never be in database, but classify for reporting)
      agentTier = 0;
      agentType = AgentType.EOA;
    } else if (validation.isERC8004Registered) {
      // ERC-8004 registered agent - Tier 1
      agentTier = 1;
      agentType = AgentType.ERC8004_AGENT;
      isERC8004 = true;
      isERC4337 = validation.isERC4337Compatible ?? false;
    } else if (validation.isERC4337Compatible) {
      // ERC-4337 smart account - Tier 2
      agentTier = 2;
      agentType = AgentType.ERC4337_ACCOUNT;
      isERC4337 = true;
    } else if (validation.accountType === 'smart_account') {
      // Other smart contract - Tier 3
      agentTier = 3;
      agentType = AgentType.SMART_CONTRACT;
    } else {
      // Unknown - fallback to tier 3
      agentTier = 3;
      agentType = AgentType.UNKNOWN;
    }

    return {
      agentTier,
      agentType,
      isERC8004,
      isERC4337,
    };
  } catch (error) {
    console.error(`[Migration] Error classifying ${address}:`, error);
    return {
      agentTier: 3,
      agentType: AgentType.UNKNOWN,
      isERC8004: false,
      isERC4337: false,
    };
  }
}

async function migrateData(
  chain: 'base' | 'baseSepolia',
  dryRun: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalAddresses: 0,
    sponsorshipRecordsUpdated: 0,
    approvedAgentsUpdated: 0,
    tierDistribution: {
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier0: 0,
      unknown: 0,
    },
    errors: [],
  };

  console.log('[Migration] Starting agent tier migration...');
  console.log(`[Migration] Chain: ${chain}`);
  console.log(`[Migration] Dry run: ${dryRun}`);
  console.log('');

  // Step 1: Get all unique addresses from SponsorshipRecord
  console.log('[Migration] Step 1: Querying SponsorshipRecord addresses...');
  const sponsorshipRecords = await prisma.sponsorshipRecord.findMany({
    select: {
      id: true,
      userAddress: true,
      agentTier: true,
    },
  });
  console.log(`[Migration] Found ${sponsorshipRecords.length} sponsorship records`);

  // Step 2: Get all unique addresses from ApprovedAgent
  console.log('[Migration] Step 2: Querying ApprovedAgent addresses...');
  const approvedAgents = await prisma.approvedAgent.findMany({
    select: {
      id: true,
      agentAddress: true,
      agentTier: true,
    },
  });
  console.log(`[Migration] Found ${approvedAgents.length} approved agents`);
  console.log('');

  // Step 3: Collect unique addresses
  const uniqueAddresses = new Set<Address>();
  sponsorshipRecords.forEach((record) => {
    if (record.userAddress) {
      uniqueAddresses.add(record.userAddress as Address);
    }
  });
  approvedAgents.forEach((agent) => {
    if (agent.agentAddress) {
      uniqueAddresses.add(agent.agentAddress as Address);
    }
  });

  stats.totalAddresses = uniqueAddresses.size;
  console.log(`[Migration] Step 3: Found ${stats.totalAddresses} unique addresses to classify`);
  console.log('');

  // Step 4: Classify each address
  console.log('[Migration] Step 4: Classifying addresses...');
  const addressTierMap = new Map<Address, TierData>();

  let processedCount = 0;
  for (const address of uniqueAddresses) {
    processedCount++;
    if (processedCount % 10 === 0 || processedCount === stats.totalAddresses) {
      process.stdout.write(`\r[Migration] Classified ${processedCount}/${stats.totalAddresses} addresses...`);
    }

    try {
      const tierData = await classifyAddress(address, chain);
      addressTierMap.set(address, tierData);

      // Update tier distribution
      if (tierData.agentTier === 1) stats.tierDistribution.tier1++;
      else if (tierData.agentTier === 2) stats.tierDistribution.tier2++;
      else if (tierData.agentTier === 3) stats.tierDistribution.tier3++;
      else if (tierData.agentTier === 0) stats.tierDistribution.tier0++;
      else stats.tierDistribution.unknown++;
    } catch (error) {
      stats.errors.push({
        address,
        error: error instanceof Error ? error.message : String(error),
      });
      // Default to tier 3 on error
      addressTierMap.set(address, {
        agentTier: 3,
        agentType: AgentType.UNKNOWN,
        isERC8004: false,
        isERC4337: false,
      });
      stats.tierDistribution.tier3++;
    }
  }
  console.log('\n');

  if (dryRun) {
    console.log('[Migration] DRY RUN - No database updates performed');
    return stats;
  }

  // Step 5: Update SponsorshipRecord entries
  console.log('[Migration] Step 5: Updating SponsorshipRecord entries...');
  for (const record of sponsorshipRecords) {
    if (!record.userAddress) continue;

    const tierData = addressTierMap.get(record.userAddress as Address);
    if (!tierData) continue;

    try {
      await prisma.sponsorshipRecord.update({
        where: { id: record.id },
        data: {
          agentTier: tierData.agentTier,
          agentType: tierData.agentType,
          isERC8004: tierData.isERC8004,
          isERC4337: tierData.isERC4337,
        },
      });
      stats.sponsorshipRecordsUpdated++;
    } catch (error) {
      stats.errors.push({
        address: record.userAddress,
        error: `SponsorshipRecord update failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  console.log(`[Migration] Updated ${stats.sponsorshipRecordsUpdated} sponsorship records`);

  // Step 6: Update ApprovedAgent entries
  console.log('[Migration] Step 6: Updating ApprovedAgent entries...');
  for (const agent of approvedAgents) {
    if (!agent.agentAddress) continue;

    const tierData = addressTierMap.get(agent.agentAddress as Address);
    if (!tierData) continue;

    try {
      await prisma.approvedAgent.update({
        where: { id: agent.id },
        data: {
          agentTier: tierData.agentTier,
          agentType: tierData.agentType,
          lastValidated: new Date(),
        },
      });
      stats.approvedAgentsUpdated++;
    } catch (error) {
      stats.errors.push({
        address: agent.agentAddress,
        error: `ApprovedAgent update failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  console.log(`[Migration] Updated ${stats.approvedAgentsUpdated} approved agents`);
  console.log('');

  return stats;
}

async function main() {
  const { chain, dryRun } = parseArgs();

  try {
    const stats = await migrateData(chain, dryRun);

    // Print summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    MIGRATION SUMMARY                      ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Addresses Processed:');
    console.log(`  Total unique addresses: ${stats.totalAddresses}`);
    console.log('');
    console.log('Database Updates:');
    console.log(`  SponsorshipRecord entries updated: ${stats.sponsorshipRecordsUpdated}`);
    console.log(`  ApprovedAgent entries updated: ${stats.approvedAgentsUpdated}`);
    console.log('');
    console.log('Tier Distribution:');
    console.log(`  Tier 1 (ERC-8004 Agents):        ${stats.tierDistribution.tier1}`);
    console.log(`  Tier 2 (ERC-4337 Accounts):      ${stats.tierDistribution.tier2}`);
    console.log(`  Tier 3 (Smart Contracts):        ${stats.tierDistribution.tier3}`);
    console.log(`  Tier 0 (EOAs - REJECTED):        ${stats.tierDistribution.tier0}`);
    console.log(`  Unknown:                         ${stats.tierDistribution.unknown}`);
    console.log('');

    if (stats.tierDistribution.tier0 > 0) {
      console.log('⚠️  WARNING: Found EOAs (Tier 0) in database!');
      console.log('   These should be investigated and removed.');
      console.log('');
    }

    if (stats.errors.length > 0) {
      console.log(`Errors encountered: ${stats.errors.length}`);
      console.log('');
      stats.errors.slice(0, 10).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.address}: ${err.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more errors`);
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════');

    if (dryRun) {
      console.log('');
      console.log('This was a DRY RUN. No changes were made to the database.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('');
      console.log('✅ Migration completed successfully!');
    }

    process.exit(stats.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
