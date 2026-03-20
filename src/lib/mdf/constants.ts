/**
 * Aegis MDF Layer - Contract addresses and ABIs for MetaMask Delegation Framework
 *
 * Addresses sourced from: https://github.com/MetaMask/delegation-framework
 * Update DELEGATION_MANAGER_ADDRESSES when new chains or versions are deployed.
 */

/** DelegationManager contract addresses keyed by chainId. */
export const DELEGATION_MANAGER_ADDRESSES: Record<number, `0x${string}`> = {
  // Base Sepolia (testnet — primary for hackathon demo)
  84532: (process.env.MDF_DELEGATION_MANAGER_ADDRESS_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  // Base Mainnet
  8453: (process.env.MDF_DELEGATION_MANAGER_ADDRESS_BASE ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
};

/**
 * Minimal ABI for DelegationManager.sol.
 * Only includes the two functions Aegis calls:
 *   redeemDelegations — executes delegated calls
 *   isDelegationDisabled — revocation check (used in policy)
 */
export const DELEGATION_MANAGER_ABI = [
  {
    inputs: [
      { name: '_permissionContexts', type: 'bytes[]' },
      { name: '_modes', type: 'bytes32[]' },
      { name: '_executionCallDatas', type: 'bytes[]' },
    ],
    name: 'redeemDelegations',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_delegationHash', type: 'bytes32' }],
    name: 'isDelegationDisabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Standard caveat enforcer addresses on Base Sepolia.
 * Sourced from MDF deployment artifacts.
 * Set via env vars to allow override without code changes.
 */
export const CAVEAT_ENFORCERS_BASE_SEPOLIA = {
  AllowedTargets: (process.env.MDF_ENFORCER_ALLOWED_TARGETS_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  AllowedMethods: (process.env.MDF_ENFORCER_ALLOWED_METHODS_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  ERC20TransferAmount: (process.env.MDF_ENFORCER_ERC20_TRANSFER_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  Timestamp: (process.env.MDF_ENFORCER_TIMESTAMP_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  ValueLte: (process.env.MDF_ENFORCER_VALUE_LTE_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
  Nonce: (process.env.MDF_ENFORCER_NONCE_BASE_SEPOLIA ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const;

/** Get DelegationManager address for the current chain. Returns undefined if not configured. */
export function getDelegationManagerAddress(chainId: number): `0x${string}` | undefined {
  const addr = DELEGATION_MANAGER_ADDRESSES[chainId];
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    return undefined;
  }
  return addr;
}

/** Resolve DelegationManager address from env or chain map. */
export function resolveDelegationManagerAddress(): `0x${string}` | undefined {
  const envAddr = process.env.MDF_DELEGATION_MANAGER_ADDRESS;
  if (envAddr) return envAddr as `0x${string}`;

  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const chainId = networkId === 'base' ? 8453 : 84532;
  return getDelegationManagerAddress(chainId);
}
