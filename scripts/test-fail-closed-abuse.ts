#!/usr/bin/env npx tsx
/**
 * SEC-3: Fail-closed abuse detection test
 *
 * Runs the abuse-detection unit tests that verify:
 * - checkSybilAttack returns isAbusive: true when Redis throws
 * - checkDustSpam returns isAbusive: true when fetch throws
 * - detectAbuse returns isAbusive: true when any check throws
 *
 * Run: npx tsx scripts/test-fail-closed-abuse.ts
 */

import { execSync } from 'child_process';

execSync('npx vitest run tests/agent/security/abuse-detection.test.ts', {
  stdio: 'inherit',
});
