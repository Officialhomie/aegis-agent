/**
 * ETHSKILLS Fetcher
 * Fetches and caches Ethereum knowledge from ethskills.com for use in reasoning and guards.
 */

import { logger } from '../logger';
import { ETHSKILLS_URLS, ETHSKILLS_CACHE_TTL_MS, type EthSkillsKey } from './constants';
import type { EthSkillsCache, EthSkillsParsedThresholds } from './types';

let cache: EthSkillsCache | null = null;

/**
 * Fetch a single skill from ethskills.com.
 */
export async function fetchEthSkill(key: EthSkillsKey): Promise<string> {
  const url = ETHSKILLS_URLS[key];
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/markdown' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    logger.warn('[EthSkills] Fetch failed', { key, url, error: err instanceof Error ? err.message : String(err) });
    return '';
  }
}

/**
 * Fetch all Aegis-relevant skills and cache them.
 */
export async function fetchAllEthSkills(): Promise<EthSkillsCache> {
  const now = Date.now();
  const content: Record<EthSkillsKey, string> = {
    gas: '',
    wallets: '',
    standards: '',
    l2s: '',
    addresses: '',
  };

  const results = await Promise.allSettled(
    (Object.keys(ETHSKILLS_URLS) as EthSkillsKey[]).map(async (key) => {
      const text = await fetchEthSkill(key);
      content[key] = text;
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    logger.warn('[EthSkills] Some fetches failed', { failed: failed.length, total: results.length });
  } else {
    logger.info('[EthSkills] Fetched all skills', { keys: Object.keys(content) });
  }

  cache = { content, fetchedAt: now };
  return cache;
}

/**
 * Get cached ETHSKILLS content. Fetches if cache is empty or expired.
 */
export async function getEthSkillsCache(): Promise<EthSkillsCache> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < ETHSKILLS_CACHE_TTL_MS) {
    return cache;
  }
  return fetchAllEthSkills();
}

/**
 * Get a single skill's content. Fetches all if cache is empty/expired.
 */
export async function getEthSkill(key: EthSkillsKey): Promise<string> {
  const c = await getEthSkillsCache();
  return c.content[key] ?? '';
}

/**
 * Get ETHSKILLS context for LLM reasoning (gas, wallets, standards, l2s).
 * Addresses skill is excluded from reasoning context (too long); use getEthSkill('addresses') when needed.
 */
export async function getEthSkillsReasoningContext(): Promise<string> {
  const c = await getEthSkillsCache();
  const parts: string[] = [];

  if (c.content.gas) {
    parts.push('## Gas & Costs (ethskills.com/gas)\n' + c.content.gas);
  }
  if (c.content.wallets) {
    parts.push('## Wallets & Paymaster (ethskills.com/wallets)\n' + c.content.wallets);
  }
  if (c.content.standards) {
    parts.push('## Standards - ERC-8004, x402 (ethskills.com/standards)\n' + c.content.standards);
  }
  if (c.content.l2s) {
    parts.push('## Layer 2s - Base, L2 selection (ethskills.com/l2s)\n' + c.content.l2s);
  }

  if (parts.length === 0) return '';
  return '\n\n---\n\n**Current Ethereum knowledge (ETHSKILLS, verify dates):**\n\n' + parts.join('\n\n---\n\n');
}

/**
 * Parse gas skill content for red-flag thresholds.
 * Looks for patterns like "Gas price >200 gwei", "Cost >$100", etc.
 */
export function parseGasThresholds(gasContent: string): EthSkillsParsedThresholds {
  const defaults: EthSkillsParsedThresholds = {
    gasRejectGwei: 200,
    costRejectUsd: 100,
    parsed: false,
  };

  if (!gasContent) return defaults;

  let gasRejectGwei = defaults.gasRejectGwei;
  let costRejectUsd = defaults.costRejectUsd;
  let parsed = false;

  // "Gas price >200 gwei" or ">200 gwei" or "gas price > 200"
  const gasMatch = gasContent.match(/gas\s+price\s*[>]\s*(\d+)\s*gwei|>\s*(\d+)\s*gwei|>\s*(\d+)\s*\(.*gwei/gi);
  if (gasMatch) {
    const nums = gasMatch.flatMap((m) => [...m.matchAll(/(\d+)/g)].map((n) => parseInt(n[1], 10)));
    if (nums.length > 0) {
      gasRejectGwei = Math.min(...nums);
      parsed = true;
    }
  }

  // "Cost >$100" or ">$100" or "cost > $100"
  const costMatch = gasContent.match(/cost\s*[>]\s*\$?\s*(\d+)|>\s*\$?\s*(\d+)\s*for|>\s*\$(\d+)/gi);
  if (costMatch) {
    const nums = costMatch.flatMap((m) => [...m.matchAll(/\$?\s*(\d+)/g)].map((n) => parseInt(n[1], 10)));
    if (nums.length > 0) {
      costRejectUsd = Math.min(...nums);
      parsed = true;
    }
  }

  return { gasRejectGwei, costRejectUsd, parsed };
}

/**
 * Get parsed gas thresholds for guards. Uses ETHSKILLS content when available.
 */
export async function getGasThresholds(): Promise<EthSkillsParsedThresholds> {
  const gasContent = await getEthSkill('gas');
  const parsed = parseGasThresholds(gasContent);

  // Env overrides take precedence
  const envGas = process.env.SKILLS_GAS_REJECT_GWEI;
  const envCost = process.env.SKILLS_COST_REJECT_USD;
  if (envGas) parsed.gasRejectGwei = Number(envGas);
  if (envCost) parsed.costRejectUsd = Number(envCost);

  return parsed;
}
