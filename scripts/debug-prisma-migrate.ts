/**
 * Diagnostic script: run prisma migrate dev and log progress to debug.log
 * to find where it hangs. Use: npx tsx scripts/debug-prisma-migrate.ts
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { appendFileSync } from 'fs';

const DEBUG_LOG = '/Users/mac/aegis-agent/.cursor/debug.log';
const TIMEOUT_MS = 35000;

function log(payload: Record<string, unknown>) {
  try {
    appendFileSync(DEBUG_LOG, JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n');
  } catch (_) {}
}

function main() {
  const root = resolve(__dirname, '..');
  // #region agent log
  const directUrlHost = process.env.DIRECT_URL?.replace(/^[^@]+@/, '').replace(/\/.*$/, '').slice(0, 50) || '';
  log({
    location: 'debug-prisma-migrate.ts:start',
    message: 'spawning prisma migrate dev',
    data: { cwd: root, timeoutMs: TIMEOUT_MS, hasDbUrl: !!process.env.DATABASE_URL, hasDirectUrl: !!process.env.DIRECT_URL, directUrlHost },
    sessionId: 'debug-session',
    hypothesisId: 'H1,H2,H3',
    runId: 'post-fix',
  });
  // #endregion
  const child = spawn(
    'npx',
    ['prisma', 'migrate', 'dev', '--name', 'init'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PRISMA_DEBUG: '1' } }
  );
  let stdout = '';
  let stderr = '';
  let lastLogTs = 0;
  const flush = (source: string, chunk: string) => {
    if (source === 'stdout') stdout += chunk;
    else stderr += chunk;
    const now = Date.now();
    if (now - lastLogTs >= 3000) {
      lastLogTs = now;
      // #region agent log
      log({
        location: 'debug-prisma-migrate.ts:progress',
        message: 'migrate progress',
        data: { stdoutLen: stdout.length, stderrLen: stderr.length, stdoutTail: stdout.slice(-600), stderrTail: stderr.slice(-400) },
        sessionId: 'debug-session',
        hypothesisId: 'H2,H3,H4',
      });
      // #endregion
    }
  };
  child.stdout?.on('data', (c) => flush('stdout', c.toString()));
  child.stderr?.on('data', (c) => flush('stderr', c.toString()));
  const timeout = setTimeout(() => {
    if (child.killed) return;
    // #region agent log
    log({
      location: 'debug-prisma-migrate.ts:timeout',
      message: 'migrate timed out',
      data: { stdoutLen: stdout.length, stderrLen: stderr.length, stdoutTail: stdout.slice(-800), stderrTail: stderr.slice(-600) },
      sessionId: 'debug-session',
      hypothesisId: 'H2,H3,H4',
    });
    // #endregion
    child.kill('SIGKILL');
  }, TIMEOUT_MS);
  child.on('close', (code, signal) => {
    clearTimeout(timeout);
    // #region agent log
    log({
      location: 'debug-prisma-migrate.ts:close',
      message: 'migrate process closed',
      data: { code, signal, stdoutLen: stdout.length, stderrLen: stderr.length, stdoutTail: stdout.slice(-500), stderrTail: stderr.slice(-500) },
      sessionId: 'debug-session',
      hypothesisId: 'H4,H5',
    });
    // #endregion
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main();
