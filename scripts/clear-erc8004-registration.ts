#!/usr/bin/env tsx
/**
 * Clear ERC-8004 onChainId for the active agent so it can be re-registered (e.g. on Base mainnet).
 * Usage: npx tsx scripts/clear-erc8004-registration.ts
 */
import 'dotenv/config';
import { getPrisma } from '../src/lib/db';

async function main() {
  const prisma = getPrisma();
  const updated = await prisma.agent.updateMany({
    where: { isActive: true },
    data: { onChainId: null },
  });
  console.log(`Cleared onChainId for ${updated.count} active agent(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
