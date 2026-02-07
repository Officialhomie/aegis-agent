/**
 * Quick check: print whether a signing key is available (for local or Railway).
 * Usage: npx tsx scripts/check-key-pickup.ts
 * Or with env: dotenv -e .env -- npx tsx scripts/check-key-pickup.ts
 */
import 'dotenv/config';
import { checkKeystoreAvailability } from '../src/lib/keystore';

async function main() {
  console.log('Checking key pickup...');
  const status = await checkKeystoreAvailability();
  console.log('Result:', JSON.stringify(status, null, 2));
  if (status.available) {
    console.log('Key is picked. Method:', status.method, '| Address:', status.address);
  } else {
    console.log('No key picked.', status.error ?? '');
  }
  process.exit(status.available ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
