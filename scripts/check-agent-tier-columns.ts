import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
const prisma = getPrisma();

async function checkTable() {
  try {
    // Try to query with agentTier field
    const record = await prisma.sponsorshipRecord.findFirst({
      select: {
        id: true,
        userAddress: true,
        agentTier: true,
        agentType: true,
      }
    });
    console.log('✓ Agent tier columns exist in database');
    if (record) {
      console.log('Sample record:', record);
    } else {
      console.log('No records found yet');
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2022') {
      console.error('✗ Agent tier columns do NOT exist in database');
      console.error('Need to run: npm run db:migrate -- --name add_agent_tiers');
      process.exit(1);
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();
