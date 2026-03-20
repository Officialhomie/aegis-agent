/**
 * Deploy AegisPaymaster to Base Sepolia (or Base mainnet via AGENT_NETWORK_ID=base).
 *
 * Constructor args:
 *   entryPoint  — 0x0000000071727De22E5E9d8BAf0edAc6f37da032 (EntryPoint v0.7, same on all EVM chains)
 *   signingKey  — address derived from AEGIS_PAYMASTER_SIGNING_KEY (the approval signer's public address)
 *
 * Required env vars:
 *   AEGIS_PAYMASTER_SIGNING_KEY or AEGIS_PAYMASTER_SIGNING_KEY_ADDRESS — private key (preferred) or public address
 *   RPC_URL_BASE_SEPOLIA or RPC_URL_BASE — RPC endpoint
 *   FOUNDRY_ACCOUNT or DEPLOYER_PRIVATE_KEY — deployer credentials (must have ETH to deploy)
 *
 * Optional:
 *   BASESCAN_API_KEY — enables Basescan verification
 *
 * Usage:
 *   npm run deploy:paymaster
 * Then set in .env:
 *   AEGIS_PAYMASTER_ADDRESS=<deployed>
 */

import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';
import { resolve } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT = 'contracts/AegisPaymaster.sol:AegisPaymaster';
const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

function getSigningKeyAddress(): string {
  const addr = process.env.AEGIS_PAYMASTER_SIGNING_KEY_ADDRESS?.trim();
  if (addr) return addr;
  const pk = process.env.AEGIS_PAYMASTER_SIGNING_KEY?.trim();
  if (pk) {
    const account = privateKeyToAccount(pk as `0x${string}`);
    return account.address;
  }
  return '';
}

function main() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isBase = networkId === 'base';
  const rpcUrl = isBase
    ? process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL
    : process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_RPC_URL;
  const keystoreAccount = process.env.FOUNDRY_ACCOUNT;
  const privateKey =
    process.env.DEPLOYER_PRIVATE_KEY ??
    process.env.EXECUTE_WALLET_PRIVATE_KEY ??
    process.env.AGENT_PRIVATE_KEY;
  const signingKeyAddress = getSigningKeyAddress();

  if (!rpcUrl || !signingKeyAddress) {
    console.error('Missing required env. Set:');
    if (!rpcUrl) console.error('  - RPC_URL_BASE_SEPOLIA (or RPC_URL_BASE for mainnet)');
    if (!signingKeyAddress)
      console.error(
        '  - AEGIS_PAYMASTER_SIGNING_KEY (private key) or AEGIS_PAYMASTER_SIGNING_KEY_ADDRESS (public address)'
      );
    process.exit(1);
  }
  if (!keystoreAccount && !privateKey) {
    console.error(
      'Set FOUNDRY_ACCOUNT (keystore) or DEPLOYER_PRIVATE_KEY / EXECUTE_WALLET_PRIVATE_KEY'
    );
    process.exit(1);
  }

  const root = resolve(__dirname, '..');
  const chainId = isBase ? 8453 : 84532;

  console.log('[Deploy] Deploying AegisPaymaster', {
    network: networkId,
    entryPoint: ENTRY_POINT_V07,
    signingKeyAddress,
    auth: keystoreAccount ? 'keystore' : 'private-key',
    rpc: rpcUrl.slice(0, 40) + '...',
  });

  try {
    const argv: string[] = [
      'forge',
      'create',
      CONTRACT,
      '--broadcast',
      '--rpc-url',
      rpcUrl,
      ...(keystoreAccount ? ['--account', keystoreAccount] : ['--private-key', privateKey!]),
      '--constructor-args',
      ENTRY_POINT_V07,
      signingKeyAddress,
    ];

    const result = spawnSync('forge', argv.slice(1), {
      encoding: 'utf-8',
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const out = (result.stdout ?? '').trim();
    const stderrOut = (result.stderr ?? '').trim();
    if (result.status !== 0 && result.status != null) {
      throw new Error((result.stderr || result.stdout || `forge exit ${result.status}`).slice(0, 500));
    }

    const combined = out + '\n' + stderrOut;
    const match = combined.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    const address = match?.[1];
    if (!address) {
      console.error('[Deploy] Could not parse deployed address from forge output');
      console.error(combined);
      process.exit(1);
    }

    console.log('[Deploy] AegisPaymaster deployed to:', address);

    // Optional: verify on Basescan
    const apiKey = process.env.BASESCAN_API_KEY;
    if (apiKey) {
      try {
        const constructorArgs = execSync(
          `cast abi-encode "constructor(address,address)" "${ENTRY_POINT_V07}" "${signingKeyAddress}"`,
          { encoding: 'utf-8', cwd: root }
        ).trim();
        execSync(
          `forge verify-contract --chain-id ${chainId} --etherscan-api-key ${apiKey} --constructor-args ${constructorArgs} ${address} ${CONTRACT}`,
          { encoding: 'utf-8', cwd: root, stdio: 'pipe' }
        );
        console.log('[Deploy] Contract verified on Basescan.');
      } catch (verifyErr: unknown) {
        const verifyOut = String(
          (verifyErr as { stderr?: Buffer })?.stderr ?? (verifyErr as Error)?.message ?? ''
        );
        if (verifyOut.includes('already verified')) {
          console.log('[Deploy] Contract already verified on Basescan (skipped).');
        } else {
          console.warn('[Deploy] Verification failed (deploy succeeded). Run manually if needed:');
          console.warn(
            `  forge verify-contract --chain-id ${chainId} --constructor-args $(cast abi-encode "constructor(address,address)" ${ENTRY_POINT_V07} ${signingKeyAddress}) ${address} ${CONTRACT} --etherscan-api-key <key>`
          );
        }
      }
    }

    console.log('');
    console.log('Next steps:');
    console.log('  1. Add to .env:');
    console.log('       AEGIS_PAYMASTER_ADDRESS=' + address);
    console.log('  2. Fund the paymaster EntryPoint deposit:');
    console.log('       npm run fund:paymaster');
    if (!apiKey) {
      console.log('  3. Verify on Basescan (optional):');
      console.log(
        `     forge verify-contract --chain-id ${chainId} --constructor-args $(cast abi-encode "constructor(address,address)" ${ENTRY_POINT_V07} ${signingKeyAddress}) ${address} ${CONTRACT} --etherscan-api-key <key>`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deploy] Failed:', message);
    if (err && typeof err === 'object' && 'stderr' in err)
      console.error((err as { stderr?: Buffer }).stderr?.toString?.());
    process.exit(1);
  }
}

main();
