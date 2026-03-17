/**
 * ETHSKILLS Addresses Integration
 * Uses ethskills.com/addresses/SKILL.md for verified protocol addresses.
 * Provides validation and reference for Aegis contract addresses.
 */

import { getEthSkill } from './fetcher';
import { logger } from '../logger';
import { CONTRACTS } from '../agent/contracts/addresses';
import { ERC8004_ADDRESSES } from '../agent/identity/constants';

/** Known ETHSKILLS address patterns for Base */
const ETHSKILLS_BASE_PATTERNS: Record<string, string> = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WETH: '0x4200000000000000000000000000000000000006',
  ENTRY_POINT: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  IDENTITY_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  REPUTATION_REGISTRY: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
};

/**
 * Extract addresses from ETHSKILLS addresses markdown.
 * Uses known ETHSKILLS values as reference; parses markdown for Base section when possible.
 */
function extractAddressesFromMarkdown(content: string): Map<string, string> {
  const result = new Map<string, string>();

  // ETHSKILLS verified addresses (from addresses/SKILL.md as of 2026-03)
  for (const [k, v] of Object.entries(ETHSKILLS_BASE_PATTERNS)) {
    result.set(k, v.toLowerCase());
  }

  // Try to find Base USDC in table: | Base | 0x... |
  const usdcMatch = content.match(/\|\s*Base\s*\|[^|]*`?(0x[a-fA-F0-9]{40})`?/);
  if (usdcMatch && content.includes('USDC')) {
    result.set('USDC', usdcMatch[1].replace(/`/g, '').toLowerCase());
  }

  return result;
}

/**
 * Validate Aegis CONTRACTS against ETHSKILLS addresses.
 * Logs mismatches; returns summary.
 */
export async function validateAddressesAgainstEthSkills(): Promise<{
  valid: boolean;
  mismatches: { contract: string; aegis: string; ethskills: string }[];
}> {
  const content = await getEthSkill('addresses');
  if (!content) {
    return { valid: true, mismatches: [] };
  }

  const ethSkillsAddrs = extractAddressesFromMarkdown(content);
  const mismatches: { contract: string; aegis: string; ethskills: string }[] = [];

  const aegisBase = CONTRACTS.base;
  const checks: [string, string][] = [
    ['USDC', aegisBase.USDC],
    ['WETH', aegisBase.WETH],
    ['ENTRY_POINT', aegisBase.ENTRY_POINT],
  ];

  for (const [label, aegisAddr] of checks) {
    const ethSkillsAddr = ethSkillsAddrs.get(label);
    if (ethSkillsAddr && aegisAddr.toLowerCase() !== ethSkillsAddr.toLowerCase()) {
      mismatches.push({ contract: label, aegis: aegisAddr, ethskills: ethSkillsAddr });
    }
  }

  const erc8004Base = ERC8004_ADDRESSES.base;
  if (ethSkillsAddrs.get('IDENTITY_REGISTRY')) {
    if (erc8004Base.identityRegistry.toLowerCase() !== ethSkillsAddrs.get('IDENTITY_REGISTRY')!.toLowerCase()) {
      mismatches.push({
        contract: 'ERC8004_IDENTITY_REGISTRY',
        aegis: erc8004Base.identityRegistry,
        ethskills: ethSkillsAddrs.get('IDENTITY_REGISTRY')!,
      });
    }
  }

  if (mismatches.length > 0) {
    logger.warn('[EthSkills] Address validation mismatches', { mismatches });
  }

  return { valid: mismatches.length === 0, mismatches };
}

/**
 * Get ETHSKILLS addresses content for inclusion in context when needed.
 * Truncated to avoid token limits - use for protocol/contract decisions.
 */
export async function getEthSkillsAddressesSnippet(maxChars: number = 4000): Promise<string> {
  const content = await getEthSkill('addresses');
  if (!content) return '';

  // Return intro + Base-relevant section
  const intro = content.slice(0, 500);
  const baseIdx = content.indexOf('Base');
  const snippet =
    baseIdx >= 0
      ? intro + '\n\n...\n\n' + content.slice(Math.max(0, baseIdx - 200), baseIdx + maxChars)
      : content.slice(0, maxChars);

  return snippet;
}
