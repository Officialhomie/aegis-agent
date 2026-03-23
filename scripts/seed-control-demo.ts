/**
 * Optional demo seed: entitlement + sample policies for a fixed session.
 * Run: npx tsx scripts/seed-control-demo.ts
 *
 * Requires DATABASE_URL, migrations applied, SponsoredMethod rows (run db:seed first).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const SESSION_ID = process.env.AEG_CONTROL_DEMO_SESSION ?? 'control-demo-session';
const PROTOCOL_ID = process.env.AEG_CONTROL_DEMO_PROTOCOL ?? 'test-protocol';

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '';
if (!connectionString) {
  console.error('DATABASE_URL or DIRECT_URL required');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.entitlement.upsert({
    where: { sessionId: SESSION_ID },
    create: { sessionId: SESSION_ID, tier: 'FREE' },
    update: {},
  });

  const methods = ['sponsor', 'cycle', 'campaign'] as const;
  for (const commandName of methods) {
    const sm = await prisma.sponsoredMethod.findUnique({ where: { commandName } });
    if (!sm) {
      console.warn('Skipping', commandName, '- run npm run db:seed first');
      continue;
    }
    await prisma.userAgentPolicy.upsert({
      where: {
        sessionId_sponsoredMethodId: { sessionId: SESSION_ID, sponsoredMethodId: sm.id },
      },
      create: {
        sessionId: SESSION_ID,
        protocolId: PROTOCOL_ID,
        sponsoredMethodId: sm.id,
        dailyLimit: 10,
        totalLimit: 100,
        status: 'ACTIVE',
      },
      update: {
        protocolId: PROTOCOL_ID,
        dailyLimit: 10,
        totalLimit: 100,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });
  }

  await prisma.controlOnboardingState.upsert({
    where: { sessionId: SESSION_ID },
    create: {
      sessionId: SESSION_ID,
      step: 'STEP_5_READY',
      payload: { demo: true },
      completionPct: 100,
    },
    update: {
      step: 'STEP_5_READY',
      completionPct: 100,
    },
  });

  console.log('Aeg-control demo seed OK for session', SESSION_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
