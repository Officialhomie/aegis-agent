import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
const prisma = getPrisma();

async function finalCheck() {
  const total = await prisma.sponsorshipRecord.count();
  const byTier = await prisma.sponsorshipRecord.groupBy({
    by: ['agentTier'],
    _count: true,
  });

  console.log('\n=== Final Database State ===\n');
  console.log(`Total SponsorshipRecord entries: ${total}`);
  console.log('\nTier distribution:');
  byTier.forEach(({ agentTier, _count }) => {
    const tierName =
      agentTier === 1 ? 'Tier 1 (ERC-8004 Agents)' :
      agentTier === 2 ? 'Tier 2 (ERC-4337 Accounts)' :
      agentTier === 3 ? 'Tier 3 (Smart Contracts)' :
      `Tier ${agentTier} (Unknown)`;
    console.log(`  ${tierName}: ${_count}`);
  });

  await prisma.$disconnect();
}

finalCheck();
