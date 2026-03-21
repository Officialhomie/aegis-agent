/**
 * Nonce Integrity Test (Test 2)
 *
 * Spawns two concurrent batch-demo processes sharing the same SENDER wallet.
 * Verifies that nonce contention is correctly classified as AA25 errors,
 * without any AA23 (signature) or AA33 (paymaster) errors appearing.
 *
 * Pass criteria:
 *   - At least one AA25 error observed across combined output
 *   - At least one UserOp succeeds
 *   - No AA23 or AA33 errors (those indicate a different bug)
 *
 * Usage:
 *   npx tsx scripts/nonce-test.ts
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/batch-demo.ts');
const OPS_EACH = 5;

function runBatchDemo(label: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', SCRIPT, '--ops', String(OPS_EACH)], {
      env: process.env,
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      console.log(`[nonce-test] ${label} exited with code ${code}`);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function main() {
  console.log('[nonce-test] Launching two concurrent batch-demo processes...');
  console.log(`[nonce-test] Each will submit ${OPS_EACH} ops against the same SENDER wallet`);
  console.log('[nonce-test] Expecting AA25 nonce contention errors\n');

  // Launch both processes in parallel
  const [a, b] = await Promise.all([
    runBatchDemo('process-A'),
    runBatchDemo('process-B'),
  ]);

  const combined = a.stdout + a.stderr + b.stdout + b.stderr;

  // Analysis
  const hasAA25 = /AA25|nonce too low|invalid account nonce/i.test(combined);
  const hasSuccess = /\] PASS txHash:/i.test(combined);
  const hasAA23 = /AA23|InvalidSignatureType|0x60cd402d/i.test(combined);
  const hasAA33 = /AA33|paymaster.*SIG_FAILURE/i.test(combined);

  console.log('\n[nonce-test] === RESULTS ===');
  console.log(`AA25 nonce contention observed: ${hasAA25 ? 'YES' : 'NO'}`);
  console.log(`At least one success:           ${hasSuccess ? 'YES' : 'NO'}`);
  console.log(`AA23 errors (signature bug):    ${hasAA23 ? 'YES — UNEXPECTED' : 'NO'}`);
  console.log(`AA33 errors (paymaster bug):    ${hasAA33 ? 'YES — UNEXPECTED' : 'NO'}`);

  const pass = hasAA25 && hasSuccess && !hasAA23 && !hasAA33;
  console.log(`\n[nonce-test] VERDICT: ${pass ? 'PASS' : 'FAIL'}`);

  if (!pass) {
    if (!hasAA25) console.error('[nonce-test] FAIL: Expected AA25 nonce contention but none observed');
    if (!hasSuccess) console.error('[nonce-test] FAIL: No successful UserOps — check wallet balance');
    if (hasAA23) console.error('[nonce-test] FAIL: AA23 signature error present — unexpected');
    if (hasAA33) console.error('[nonce-test] FAIL: AA33 paymaster error present — unexpected');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[nonce-test] ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
