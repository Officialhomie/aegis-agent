/**
 * Deploy AegisReactiveObserver to Base Sepolia (or Base mainnet via AGENT_NETWORK_ID=base).
 * Supports Foundry keystore (FOUNDRY_ACCOUNT) or private key (DEPLOYER_PRIVATE_KEY / EXECUTE_WALLET_PRIVATE_KEY).
 * Contract has no constructor args; deployer becomes owner.
 *
 * Usage: npx tsx scripts/deploy-reactive-observer.ts
 * Then set REACTIVE_OBSERVER_ADDRESS=<deployed> in .env and verify on Basescan.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { resolve } from 'path';

const CONTRACT = 'contracts/AegisReactiveObserver.sol:AegisReactiveObserver';

function main() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isBase = networkId === 'base';
  const rpcUrl = isBase
    ? process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL
    : process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_RPC_URL;
  const keystoreAccount = process.env.FOUNDRY_ACCOUNT;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;

  if (!rpcUrl) {
    console.error('Missing required env. Set RPC_URL_BASE_SEPOLIA (or RPC_URL_BASE for mainnet).');
    process.exit(1);
  }
  if (!keystoreAccount && !privateKey) {
    console.error('Set FOUNDRY_ACCOUNT (keystore) or DEPLOYER_PRIVATE_KEY / EXECUTE_WALLET_PRIVATE_KEY');
    process.exit(1);
  }

  const authArgs = keystoreAccount
    ? `--account "${keystoreAccount}"`
    : `--private-key "${privateKey}"`;

  const root = resolve(__dirname, '..');

  console.log('[Deploy] Deploying AegisReactiveObserver', {
    network: networkId,
    auth: keystoreAccount ? 'keystore' : 'private-key',
    rpc: rpcUrl.slice(0, 40) + '...',
  });

  try {
    const chainId = isBase ? 8453 : 84532;
    const verifyArgs = process.env.BASESCAN_API_KEY
      ? `--verify --etherscan-api-key ${process.env.BASESCAN_API_KEY} --chain-id ${chainId}`
      : '';

    const cmd = `forge create --rpc-url "${rpcUrl}" ${authArgs} ${verifyArgs} "${CONTRACT}"`.trim().replace(/\s+/g, ' ');
    const out = execSync(cmd, { encoding: 'utf-8', cwd: root, maxBuffer: 10 * 1024 * 1024 });

    const match = out.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    const address = match?.[1];
    if (!address) {
      console.error('[Deploy] Could not parse deployed address from forge output');
      console.error(out);
      process.exit(1);
    }

    console.log('[Deploy] AegisReactiveObserver deployed to:', address);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Add to .env: REACTIVE_OBSERVER_ADDRESS=' + address);
    console.log('  2. Verify on Basescan (if not auto-verified):');
    console.log(`     forge verify-contract --chain-id ${chainId} ${address} ${CONTRACT}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deploy] Failed:', message);
    if (err && typeof err === 'object' && 'stderr' in err) console.error((err as { stderr?: Buffer }).stderr?.toString?.());
    process.exit(1);
  }
}

main();
