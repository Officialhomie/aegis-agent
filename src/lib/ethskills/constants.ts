/**
 * ETHSKILLS - Ethereum knowledge for AI agents
 * https://ethskills.com/
 *
 * Fetchable skill URLs used by Aegis for current gas costs, standards, and tooling.
 */

export const ETHSKILLS_BASE = 'https://ethskills.com';

export const ETHSKILLS_URLS = {
  /** Gas policy, max Gwei, sponsorship costs */
  gas: `${ETHSKILLS_BASE}/gas/SKILL.md`,
  /** Wallets, paymaster, key safety, Safe multisig */
  wallets: `${ETHSKILLS_BASE}/wallets/SKILL.md`,
  /** ERC-8004, x402, EIP-3009, token standards */
  standards: `${ETHSKILLS_BASE}/standards/SKILL.md`,
  /** Base vs other L2s, chain selection, deployment */
  l2s: `${ETHSKILLS_BASE}/l2s/SKILL.md`,
  /** Verified protocol addresses (oracles, DEXs, etc.) */
  addresses: `${ETHSKILLS_BASE}/addresses/SKILL.md`,
} as const;

export type EthSkillsKey = keyof typeof ETHSKILLS_URLS;

/** Cache TTL in milliseconds (6 hours) */
export const ETHSKILLS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
