import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
const prisma = getPrisma();

async function checkData() {
  try {
    const counts = await Promise.all([
      prisma.sponsorshipRecord.count(),
      prisma.approvedAgent.count(),
      prisma.queueItem.count(),
    ]);
    
    console.log('Database row counts:');
    console.log(`  SponsorshipRecord: ${counts[0]}`);
    console.log(`  ApprovedAgent: ${counts[1]}`);
    console.log(`  QueueItem: ${counts[2]}`);
    
    if (counts.every(c => c === 0)) {
      console.log('\n✓ Database is empty - safe to reset');
    } else {
      console.log('\n⚠️  Database has data - migration needed');
    }
  } catch (error) {
    console.error('Error checking data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
