/**
 * DB + API Observability Validator (Test 9)
 *
 * Queries the DB and live dashboard API to assert consistency after a batch-demo run.
 *
 * Checks:
 *   1. DelegationUsage count in DB == totalOpsSubmitted from API
 *   2. DelegationUsage success count in DB == totalOpsSuccess from API
 *   3. Every success=true row has a non-null txHash
 *   4. Every success=false row has a non-null errorMessage
 *   5. API lastUpdated is within 10s of now
 *
 * Usage:
 *   npx tsx scripts/validate-batch-demo.ts
 *
 * Exits 0 if all checks pass, 1 if any fail.
 */

import 'dotenv/config';

const PROTOCOL_ID = 'aegis-batch-demo';
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:3000';
const API_URL = `${DASHBOARD_URL}/api/dashboard/batch-demo`;

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const { getPrisma } = await import('../src/lib/db');
  const db = getPrisma();

  console.log('[validate] Fetching data from DB and API...\n');

  // Fetch delegation IDs for this protocol
  const delegations = await db.delegation.findMany({
    where: {
      usageRecords: {
        some: {
          delegation: {
            usageRecords: { some: {} },
          },
        },
      },
    },
    select: { id: true },
  });

  // Simpler approach: fetch all approvedAgents for protocol, then delegations, then usages
  const agents = await db.approvedAgent.findMany({
    where: { protocolId: PROTOCOL_ID },
    select: { agentAddress: true },
  });
  const agentAddresses = agents.map((a) => a.agentAddress.toLowerCase());

  const delegationRows = await db.delegation.findMany({
    where: { delegator: { in: agentAddresses } },
    select: { id: true },
  });
  const delegationIds = delegationRows.map((d) => d.id);

  const usages = await db.delegationUsage.findMany({
    where: { delegationId: { in: delegationIds } },
    select: { id: true, success: true, txHash: true, errorMessage: true },
  });

  const dbTotal = usages.length;
  const dbSuccess = usages.filter((u) => u.success).length;

  // Fetch API
  let apiTotal = -1;
  let apiSuccess = -1;
  let apiLastUpdated: Date | null = null;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as {
      totalOpsSubmitted?: number;
      totalOpsSuccess?: number;
      lastUpdated?: string;
    };
    apiTotal = json.totalOpsSubmitted ?? -1;
    apiSuccess = json.totalOpsSuccess ?? -1;
    apiLastUpdated = json.lastUpdated ? new Date(json.lastUpdated) : null;
  } catch (e) {
    console.error('[validate] Could not reach API:', e instanceof Error ? e.message : String(e));
    console.error('[validate] Is the Next.js server running at', DASHBOARD_URL, '?');
    process.exit(1);
  }

  const checks: CheckResult[] = [];

  // Check 1: DB total == API total
  checks.push({
    name: 'DB total == API totalOpsSubmitted',
    pass: dbTotal === apiTotal,
    detail: `DB=${dbTotal}, API=${apiTotal}`,
  });

  // Check 2: DB success == API success
  checks.push({
    name: 'DB success count == API totalOpsSuccess',
    pass: dbSuccess === apiSuccess,
    detail: `DB=${dbSuccess}, API=${apiSuccess}`,
  });

  // Check 3: Every success=true has txHash
  const successMissingTx = usages.filter((u) => u.success && !u.txHash);
  checks.push({
    name: 'All success=true rows have txHash',
    pass: successMissingTx.length === 0,
    detail: successMissingTx.length === 0
      ? 'OK'
      : `${successMissingTx.length} rows missing txHash: ${successMissingTx.map((u) => u.id).join(', ')}`,
  });

  // Check 4: Every success=false has errorMessage
  const failMissingError = usages.filter((u) => !u.success && !u.errorMessage);
  checks.push({
    name: 'All success=false rows have errorMessage',
    pass: failMissingError.length === 0,
    detail: failMissingError.length === 0
      ? 'OK'
      : `${failMissingError.length} rows missing errorMessage: ${failMissingError.map((u) => u.id).join(', ')}`,
  });

  // Check 5: API lastUpdated within 10s of now
  const nowMs = Date.now();
  const lastUpdatedMs = apiLastUpdated?.getTime() ?? 0;
  const staleSecs = Math.round((nowMs - lastUpdatedMs) / 1000);
  checks.push({
    name: 'API lastUpdated within 10s of now',
    pass: apiLastUpdated !== null && staleSecs <= 10,
    detail: apiLastUpdated
      ? `${staleSecs}s ago (${apiLastUpdated.toISOString()})`
      : 'null',
  });

  // Print results
  const maxName = Math.max(...checks.map((c) => c.name.length));
  console.log('  ' + 'Check'.padEnd(maxName + 2) + 'Result    Detail');
  console.log('  ' + '-'.repeat(maxName + 2 + 30));
  for (const c of checks) {
    const status = c.pass ? 'PASS' : 'FAIL';
    console.log(`  ${c.name.padEnd(maxName + 2)}${status.padEnd(10)}${c.detail}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n[validate] VERDICT: ${allPass ? 'ALL CHECKS PASSED' : 'FAILED'}`);

  await db.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('[validate] ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
