import type { CommandName } from '@/src/lib/agent/openclaw/types';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

const PREMIUM_COMMANDS = new Set<CommandName>([
  'create_agent',
  'update_agent',
  'delete_agent',
  'create_protocol',
  'update_protocol',
  'disable_protocol',
  'create_guarantee',
  'cancel_guarantee',
  'create_delegation',
  'revoke_delegation',
  'start_heartbeat',
  'stop_heartbeat',
  'export_sponsorships',
  'generate_report',
]);

const HIGH_RISK = new Set<CommandName>([
  'delete_agent',
  'disable_protocol',
  'revoke_delegation',
  'cancel_guarantee',
  'block_wallet',
]);

/** Commands that can trigger gas sponsorship / sponsored UserOps path. */
export const SPONSORSHIP_SENSITIVE_COMMANDS = new Set<CommandName>(['sponsor', 'cycle', 'campaign']);

function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function riskTierForCommand(name: CommandName): RiskTier {
  if (HIGH_RISK.has(name)) return 'HIGH';
  if (SPONSORSHIP_SENSITIVE_COMMANDS.has(name)) return 'MEDIUM';
  return 'LOW';
}

export function sponsoredMethodDefaults(name: CommandName): {
  displayName: string;
  description: string;
  riskTier: RiskTier;
  isPremium: boolean;
  defaultDailyLimit: number;
  defaultTotalLimit: number;
} {
  const isPremium = PREMIUM_COMMANDS.has(name);
  const riskTier = riskTierForCommand(name);
  return {
    displayName: humanize(name),
    description: `OpenClaw command: ${name}`,
    riskTier,
    isPremium,
    defaultDailyLimit: riskTier === 'HIGH' ? 3 : riskTier === 'MEDIUM' ? 10 : 20,
    defaultTotalLimit: riskTier === 'HIGH' ? 30 : riskTier === 'MEDIUM' ? 100 : 200,
  };
}
