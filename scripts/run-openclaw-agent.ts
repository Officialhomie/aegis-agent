/**
 * OpenClaw-compatible Aegis agent entry point.
 *
 * Run this to start Aegis as an OpenClaw-managed agent:
 *   npm run openclaw
 *
 * This process:
 *   1. Initialises MEMORY.md for cross-session persistence
 *   2. Logs startup to memory
 *   3. Starts the autonomous multi-mode loop (sponsorship + reserves)
 *
 * OpenClaw communicates with Aegis via the Next.js HTTP endpoint:
 *   POST /api/openclaw
 *
 * To run both this process and the Next.js server together:
 *   1. Start the Next.js server: npm run dev  (or npm start in production)
 *   2. Start this process: npm run openclaw
 *
 * The Next.js server handles incoming OpenClaw commands.
 * This process runs the autonomous agent loop.
 */

import { startAutonomousPaymaster } from '../src/lib/agent/index';
import { ensureMemoryFile, appendActionLog } from '../src/lib/agent/openclaw/memory-manager';

async function main(): Promise<void> {
  // Ensure MEMORY.md exists on disk
  await ensureMemoryFile();
  await appendActionLog('STARTUP', 'Aegis OpenClaw agent started');

  console.log('[OpenClaw Agent] Aegis starting in OpenClaw mode');
  console.log('[OpenClaw Agent] MEMORY.md: persistent session log active');
  console.log('[OpenClaw Agent] Commands available via POST /api/openclaw');
  console.log('[OpenClaw Agent] Starting autonomous loop...');

  // Start the autonomous ORPEM loop — this blocks until process exits
  await startAutonomousPaymaster();
}

main().catch((err) => {
  console.error('[OpenClaw Agent] Fatal error:', err);
  process.exit(1);
});
