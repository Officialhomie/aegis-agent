/**
 * Seed sample protocol sponsors for Base paymaster.
 * Run: npx prisma db seed
 * Prisma 7: schema has no url in datasource, so use adapter with env URL.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '';
if (!connectionString) throw new Error('DATABASE_URL or DIRECT_URL required for seed');
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const protocols = [
    {
      protocolId: 'test-protocol',
      name: 'Test Protocol',
      balanceUSD: 100,
      tier: 'bronze',
      whitelistedContracts: [] as string[],
    },
    {
      protocolId: 'uniswap-sponsor',
      name: 'Uniswap Gas Sponsor',
      balanceUSD: 500,
      tier: 'silver',
      whitelistedContracts: [] as string[],
    },
    {
      protocolId: 'aave-sponsor',
      name: 'Aave Gas Sponsor',
      balanceUSD: 250,
      tier: 'bronze',
      whitelistedContracts: [] as string[],
    },
  ];

  for (const p of protocols) {
    await prisma.protocolSponsor.upsert({
      where: { protocolId: p.protocolId },
      create: p,
      update: { name: p.name, tier: p.tier, balanceUSD: p.balanceUSD },
    });
    console.log('Seeded protocol:', p.protocolId);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
