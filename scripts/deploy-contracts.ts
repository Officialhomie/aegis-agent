/**
 * Deploy all Aegis contracts (AegisActivityLogger, AegisReactiveObserver) in sequence.
 * Uses same env as individual scripts: FOUNDRY_ACCOUNT or DEPLOYER_PRIVATE_KEY, AGENT_WALLET_ADDRESS, RPC URLs.
 *
 * Usage: npx tsx scripts/deploy-contracts.ts
 * Then add the output addresses to .env.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ACTIVITY_LOGGER = 'contracts/AegisActivityLogger.sol:AegisActivityLogger';
const REACTIVE_OBSERVER = 'contracts/AegisReactiveObserver.sol:AegisReactiveObserver';

function getEnv() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isBase = networkId === 'base';
  const rpcUrl = isBase
    ? process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL
    : process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_RPC_URL;
  const keystoreAccount = process.env.FOUNDRY_ACCOUNT;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  const chainId = isBase ? 8453 : 84532;
  return { networkId, rpcUrl, keystoreAccount, privateKey, agentWallet, chainId };
}

function main() {
  const { networkId, rpcUrl, keystoreAccount, privateKey, agentWallet, chainId } = getEnv();

  if (!rpcUrl) {
    console.error('Missing RPC_URL_BASE_SEPOLIA (or RPC_URL_BASE for mainnet).');
    process.exit(1);
  }
  if (!keystoreAccount && !privateKey) {
    console.error('Set FOUNDRY_ACCOUNT (keystore) or DEPLOYER_PRIVATE_KEY / EXECUTE_WALLET_PRIVATE_KEY');
    process.exit(1);
  }
  if (!agentWallet) {
    console.error('AGENT_WALLET_ADDRESS is required for AegisActivityLogger deployment.');
    process.exit(1);
  }

  const authArgs = keystoreAccount
    ? `--account "${keystoreAccount}"`
    : `--private-key "${privateKey}"`;

  const root = resolve(__dirname, '..');
  const verifyArgs = process.env.BASESCAN_API_KEY
    ? `--verify --etherscan-api-key ${process.env.BASESCAN_API_KEY} --chain-id ${chainId}`
    : '';

  let activityLoggerAddress: string | null = null;
  let reactiveObserverAddress: string | null = null;

  console.log('[Deploy] Deploying all contracts to', networkId);
  console.log('');

  try {
    // 1. AegisActivityLogger
    const encoded = execSync(
      `cast abi-encode "constructor(address)" "${agentWallet}"`,
      { encoding: 'utf-8', cwd: root }
    ).trim();
    const cmd1 = `forge create --rpc-url "${rpcUrl}" ${authArgs} --constructor-args ${encoded} ${verifyArgs} "${ACTIVITY_LOGGER}"`.trim().replace(/\s+/g, ' ');
    const out1 = execSync(cmd1, { encoding: 'utf-8', cwd: root, maxBuffer: 10 * 1024 * 1024 });
    const m1 = out1.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    activityLoggerAddress = m1?.[1] ?? null;
    if (!activityLoggerAddress) {
      console.error('[Deploy] Could not parse AegisActivityLogger address');
      console.error(out1);
      process.exit(1);
    }
    console.log('[Deploy] AegisActivityLogger deployed to:', activityLoggerAddress);

    // 2. AegisReactiveObserver
    const cmd2 = `forge create --rpc-url "${rpcUrl}" ${authArgs} ${verifyArgs} "${REACTIVE_OBSERVER}"`.trim().replace(/\s+/g, ' ');
    const out2 = execSync(cmd2, { encoding: 'utf-8', cwd: root, maxBuffer: 10 * 1024 * 1024 });
    const m2 = out2.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
    reactiveObserverAddress = m2?.[1] ?? null;
    if (!reactiveObserverAddress) {
      console.error('[Deploy] Could not parse AegisReactiveObserver address');
      console.error(out2);
      process.exit(1);
    }
    console.log('[Deploy] AegisReactiveObserver deployed to:', reactiveObserverAddress);

    console.log('');
    console.log('--- Add to .env ---');
    console.log(`ACTIVITY_LOGGER_ADDRESS=${activityLoggerAddress}`);
    console.log(`REACTIVE_OBSERVER_ADDRESS=${reactiveObserverAddress}`);
    console.log('');
    console.log('Verify manually if not auto-verified:');
    console.log(`  forge verify-contract --chain-id ${chainId} --constructor-args $(cast abi-encode "constructor(address)" ${agentWallet}) ${activityLoggerAddress} ${ACTIVITY_LOGGER}`);
    console.log(`  forge verify-contract --chain-id ${chainId} ${reactiveObserverAddress} ${REACTIVE_OBSERVER}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deploy] Failed:', message);
    if (err && typeof err === 'object' && 'stderr' in err) console.error((err as { stderr?: Buffer }).stderr?.toString?.());
    process.exit(1);
  }
}

main();
