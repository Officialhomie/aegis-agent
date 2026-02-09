/**
 * Deploy AegisReactiveObserver to Base Sepolia (or Base mainnet via AGENT_NETWORK_ID=base).
 * Uses cast/forge. Supports FOUNDRY_ACCOUNT (e.g. deployer-onetruehomie) or DEPLOYER_PRIVATE_KEY.
 * For keystore: run in a terminal to enter password, or set CAST_PASSWORD.
 * Contract has no constructor args; deployer becomes owner.
 *
 * Usage: npm run deploy:reactive-observer
 * Then set REACTIVE_OBSERVER_ADDRESS=<deployed> in .env.
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
    // Deploy WITHOUT --verify so "Contract already verified" from Basescan never fails the deploy
    const cmd = `forge create "${CONTRACT}" --rpc-url "${rpcUrl}" ${authArgs} --broadcast`.trim().replace(/\s+/g, ' ');
    const out = execSync(cmd, { encoding: 'utf-8', cwd: root, maxBuffer: 10 * 1024 * 1024 });

    const match = out.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    const address = match?.[1];
    if (!address) {
      console.error('[Deploy] Could not parse deployed address from forge output');
      console.error(out);
      process.exit(1);
    }

    console.log('[Deploy] AegisReactiveObserver deployed to:', address);

    // Optional: verify in a separate step (non-fatal; "already verified" is OK)
    const apiKey = process.env.BASESCAN_API_KEY;
    if (apiKey) {
      try {
        execSync(
          `forge verify-contract --chain-id ${chainId} --etherscan-api-key ${apiKey} ${address} ${CONTRACT}`,
          { encoding: 'utf-8', cwd: root, stdio: 'pipe' }
        );
        console.log('[Deploy] Contract verified on Basescan.');
      } catch (verifyErr: unknown) {
        const verifyOut = String((verifyErr as { stderr?: Buffer })?.stderr ?? (verifyErr as Error)?.message ?? '');
        if (verifyOut.includes('already verified')) {
          console.log('[Deploy] Contract already verified on Basescan (skipped).');
        } else {
          console.warn('[Deploy] Verification failed (deploy succeeded). Run manually if needed:');
          console.warn(`  forge verify-contract --chain-id ${chainId} --etherscan-api-key <key> ${address} ${CONTRACT}`);
        }
      }
    }

    console.log('');
    console.log('Next steps:');
    console.log('  1. Add to .env: REACTIVE_OBSERVER_ADDRESS=' + address);
    if (!apiKey) {
      console.log('  2. Verify on Basescan (optional):');
      console.log(`     forge verify-contract --chain-id ${chainId} ${address} ${CONTRACT} --etherscan-api-key <key>`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deploy] Failed:', message);
    if (err && typeof err === 'object' && 'stderr' in err) console.error((err as { stderr?: Buffer }).stderr?.toString?.());
    process.exit(1);
  }
}

main();
