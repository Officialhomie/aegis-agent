#!/usr/bin/env tsx
/**
 * Register EAS Gas Passport schema on Base.
 * Run once per chain. Requires keystore + ETH for gas.
 *
 * Usage: npx tsx scripts/register-eas-schema.ts
 */

import 'dotenv/config';
import { registerGasPassportSchema } from '../src/lib/agent/identity/eas-attestation';

async function main() {
  console.log('[register-eas-schema] Registering Gas Passport schema on EAS...');
  const result = await registerGasPassportSchema();
  if (result.success) {
    console.log('[register-eas-schema] Success:', result.schemaUID, result.txHash);
    console.log('Add to .env: EAS_GAS_PASSPORT_SCHEMA_UID=' + result.schemaUID);
  } else {
    console.error('[register-eas-schema] Failed:', result.error);
    process.exit(1);
  }
}

main();
