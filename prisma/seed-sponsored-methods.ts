import type { PrismaClient } from '@prisma/client';
import { ALL_COMMAND_NAMES } from '../src/lib/agent/openclaw/types';
import { sponsoredMethodDefaults } from '../src/lib/product/catalog/sponsored-method-metadata';

export async function seedSponsoredMethods(prisma: PrismaClient): Promise<void> {
  for (const commandName of ALL_COMMAND_NAMES) {
    const d = sponsoredMethodDefaults(commandName);
    await prisma.sponsoredMethod.upsert({
      where: { commandName },
      create: {
        commandName,
        displayName: d.displayName,
        description: d.description,
        riskTier: d.riskTier,
        isPremium: d.isPremium,
        defaultDailyLimit: d.defaultDailyLimit,
        defaultTotalLimit: d.defaultTotalLimit,
      },
      update: {
        displayName: d.displayName,
        description: d.description,
        riskTier: d.riskTier,
        isPremium: d.isPremium,
        defaultDailyLimit: d.defaultDailyLimit,
        defaultTotalLimit: d.defaultTotalLimit,
      },
    });
  }
  console.log(`Seeded ${ALL_COMMAND_NAMES.length} SponsoredMethod rows.`);
}
