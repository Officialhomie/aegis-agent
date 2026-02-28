import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import { AgentType } from '@prisma/client';

const prisma = getPrisma();

async function cleanupEOAs() {
  console.log('[Cleanup] Removing EOA records from database...\n');

  // Find all EOA records
  const eoaRecords = await prisma.sponsorshipRecord.findMany({
    where: {
      agentTier: 0,
      agentType: AgentType.EOA,
    },
    select: {
      id: true,
      userAddress: true,
    },
  });

  console.log(`Found ${eoaRecords.length} EOA records to remove`);

  if (eoaRecords.length === 0) {
    console.log('✓ No EOA records found - database is clean');
    await prisma.$disconnect();
    return;
  }

  // Show sample addresses
  console.log('\nSample EOA addresses to be removed:');
  eoaRecords.slice(0, 5).forEach((record, idx) => {
    console.log(`  ${idx + 1}. ${record.userAddress}`);
  });

  if (eoaRecords.length > 5) {
    console.log(`  ... and ${eoaRecords.length - 5} more`);
  }

  // Delete EOA records
  const result = await prisma.sponsorshipRecord.deleteMany({
    where: {
      agentTier: 0,
      agentType: AgentType.EOA,
    },
  });

  console.log(`\n✅ Removed ${result.count} EOA records from database`);

  // Verify cleanup
  const remaining = await prisma.sponsorshipRecord.count({
    where: {
      agentTier: 0,
    },
  });

  if (remaining === 0) {
    console.log('✓ All EOA records successfully removed');
  } else {
    console.warn(`⚠️  Warning: ${remaining} tier 0 records still remain`);
  }

  await prisma.$disconnect();
}

cleanupEOAs().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
