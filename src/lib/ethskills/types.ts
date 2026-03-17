/**
 * ETHSKILLS types
 */

import type { EthSkillsKey } from './constants';

export interface EthSkillsCache {
  content: Record<EthSkillsKey, string>;
  fetchedAt: number;
}

export interface EthSkillsParsedThresholds {
  /** Gas price (gwei) above which to reject - from "Gas price >X gwei" patterns */
  gasRejectGwei: number;
  /** Cost (USD) above which to reject - from "Cost >$X" patterns */
  costRejectUsd: number;
  /** Whether thresholds were successfully parsed from content */
  parsed: boolean;
}
