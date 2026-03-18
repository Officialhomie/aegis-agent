/**
 * ETHSKILLS - Ethereum knowledge for AI agents
 * https://ethskills.com/
 *
 * Fetchable Ethereum knowledge so Aegis uses current gas costs, standards,
 * and tooling instead of stale training data.
 */

export {
  fetchEthSkill,
  fetchAllEthSkills,
  getEthSkillsCache,
  getEthSkill,
  getEthSkillsReasoningContext,
  parseGasThresholds,
  getGasThresholds,
} from './fetcher';
export {
  validateAddressesAgainstEthSkills,
  getEthSkillsAddressesSnippet,
} from './addresses';
export { ETHSKILLS_URLS, ETHSKILLS_CACHE_TTL_MS, type EthSkillsKey } from './constants';
export type { EthSkillsCache, EthSkillsParsedThresholds } from './types';
