/**
 * Deploy AegisActivityLogger to Base Sepolia (or Base mainnet via AGENT_NETWORK_ID=base).
 * Uses cast/forge under the hood. Supports Foundry keystore (FOUNDRY_ACCOUNT) or private key.
 *
 * With keystore account (e.g. deployer-onetruehomie):
 *   Set FOUNDRY_ACCOUNT=deployer-onetruehomie in .env.
 *   Run in a terminal so you can enter the keystore password when prompted,
 *   or set CAST_PASSWORD for non-interactive deploy.
 *
 * With private key: set DEPLOYER_PRIVATE_KEY or EXECUTE_WALLET_PRIVATE_KEY.
 *
 * Requires: AGENT_WALLET_ADDRESS, RPC URL, and FOUNDRY_ACCOUNT or DEPLOYER_PRIVATE_KEY.
 *
 * Usage: npm run deploy:activity-logger
 * Then set ACTIVITY_LOGGER_ADDRESS=<deployed> in .env.
 */

import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';
import { resolve } from 'path';

const CONTRACT = 'contracts/AegisActivityLogger.sol:AegisActivityLogger';

function main() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isBase = networkId === 'base';
  const rpcUrl = isBase
    ? process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL
    : process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_RPC_URL;
  const keystoreAccount = process.env.FOUNDRY_ACCOUNT;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;

  if (!rpcUrl || !agentWallet) {
    console.error('Missing required env. Set:');
    if (!rpcUrl) console.error('  - RPC_URL_BASE_SEPOLIA (or RPC_URL_BASE for mainnet)');
    if (!agentWallet) console.error('  - AGENT_WALLET_ADDRESS (the aegisAgent address that can log)');
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

  console.log('[Deploy] Deploying AegisActivityLogger', {
    network: networkId,
    agentWallet,
    auth: keystoreAccount ? 'keystore' : 'private-key',
    rpc: rpcUrl.slice(0, 40) + '...',
  });

  try {
    const chainId = isBase ? 8453 : 84532;
    // Deploy WITHOUT --verify so "Contract already verified" never fails the deploy
    const argv: string[] = [
      'forge', 'create', CONTRACT,
      '--broadcast',
      '--rpc-url', rpcUrl,
      ...(keystoreAccount ? ['--account', keystoreAccount] : ['--private-key', privateKey!]),
      '--constructor-args', agentWallet!,
    ];
    let out: string;
    let stderrOut: string;
    try {
      const result = spawnSync('forge', argv.slice(1), { encoding: 'utf-8', cwd: root, maxBuffer: 10 * 1024 * 1024, stdio: ['inherit', 'pipe', 'pipe'] });
      out = (result.stdout ?? '').trim();
      stderrOut = (result.stderr ?? '').trim();
      if (result.status !== 0 && result.status != null) throw new Error((result.stderr || result.stdout || `forge exit ${result.status}`).slice(0, 500));
    } catch (execErr) {
      throw execErr;
    }
    const combined = out + '\n' + stderrOut;
    const match = combined.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    const address = match?.[1];
    if (!address) {
      console.error('[Deploy] Could not parse deployed address from forge output');
      console.error(combined);
      process.exit(1);
    }

    console.log('[Deploy] AegisActivityLogger deployed to:', address);

    // Optional: verify in a separate step (non-fatal; "already verified" is OK)
    const apiKey = process.env.BASESCAN_API_KEY;
    if (apiKey) {
      try {
        const constructorArgs = execSync(
          `cast abi-encode "constructor(address)" "${agentWallet}"`,
          { encoding: 'utf-8', cwd: root }
        ).trim();
        execSync(
          `forge verify-contract --chain-id ${chainId} --etherscan-api-key ${apiKey} --constructor-args ${constructorArgs} ${address} ${CONTRACT}`,
          { encoding: 'utf-8', cwd: root, stdio: 'pipe' }
        );
        console.log('[Deploy] Contract verified on Basescan.');
      } catch (verifyErr: unknown) {
        const verifyOut = String((verifyErr as { stderr?: Buffer })?.stderr ?? (verifyErr as Error)?.message ?? '');
        if (verifyOut.includes('already verified')) {
          console.log('[Deploy] Contract already verified on Basescan (skipped).');
        } else {
          console.warn('[Deploy] Verification failed (deploy succeeded). Run manually if needed:');
          console.warn(`  forge verify-contract --chain-id ${chainId} --constructor-args $(cast abi-encode "constructor(address)" ${agentWallet}) ${address} ${CONTRACT} --etherscan-api-key <key>`);
        }
      }
    }

    console.log('');
    console.log('Next steps:');
    console.log('  1. Add to .env: ACTIVITY_LOGGER_ADDRESS=' + address);
    if (!apiKey) {
      console.log('  2. Verify on Basescan (optional):');
      console.log(`     forge verify-contract --chain-id ${chainId} --constructor-args $(cast abi-encode "constructor(address)" ${agentWallet}) ${address} ${CONTRACT} --etherscan-api-key <key>`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deploy] Failed:', message);
    if (err && typeof err === 'object' && 'stderr' in err) console.error((err as { stderr?: Buffer }).stderr?.toString?.());
    process.exit(1);
  }
}

main();
