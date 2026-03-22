/**
 * Types for the OpenClaw integration layer.
 *
 * OpenClaw is the local-first agent framework that lets users communicate
 * with Aegis via WhatsApp, Telegram, or Signal.
 */

export type CommandName =
  // Phase 1: Monitoring & Basic Control
  | 'status'
  | 'cycle'
  | 'sponsor'
  | 'report'
  | 'pause'
  | 'resume'
  | 'help'
  // Phase 2: Management & Policy
  | 'pause_timed'
  | 'set_budget'
  | 'analytics'
  | 'block_wallet'
  | 'set_gas_cap'
  | 'topup'
  | 'passport'
  | 'campaign'
  | 'campaign_status'
  // Agent-first tier management commands
  | 'set_min_tier'
  | 'prioritize_agent'
  | 'pause_tier'
  | 'resume_tier'
  | 'queue_stats'
  | 'tier_report'
  // ============================================================================
  // OpenClaw Expanded Commands (require OPENCLAW_EXPANDED=true)
  // ============================================================================
  // ApprovedAgent CRUD
  | 'create_agent'
  | 'update_agent'
  | 'delete_agent'
  | 'get_agent'
  | 'list_agents'
  // ProtocolSponsor CRUD
  | 'create_protocol'
  | 'update_protocol'
  | 'disable_protocol'
  | 'get_protocol'
  | 'list_protocols'
  // Budget Management
  | 'topup_budget'
  | 'set_daily_budget'
  | 'show_budget'
  // Execution Guarantees CRUD
  | 'create_guarantee'
  | 'cancel_guarantee'
  | 'list_guarantees'
  | 'get_guarantee'
  // Delegation Management
  | 'create_delegation'
  | 'revoke_delegation'
  | 'list_delegations'
  | 'get_delegation'
  // Heartbeat & Liveness
  | 'start_heartbeat'
  | 'stop_heartbeat'
  | 'liveness_report'
  // Reports & Audit
  | 'export_sponsorships'
  | 'audit_log'
  | 'generate_report'
  // Safety & Confirmation
  | 'confirm'
  | 'commands';

/** Runtime list of all OpenClaw commands — keep in sync with `CommandName`. */
export const ALL_COMMAND_NAMES: readonly CommandName[] = [
  'status',
  'cycle',
  'sponsor',
  'report',
  'pause',
  'resume',
  'help',
  'pause_timed',
  'set_budget',
  'analytics',
  'block_wallet',
  'set_gas_cap',
  'topup',
  'passport',
  'campaign',
  'campaign_status',
  'set_min_tier',
  'prioritize_agent',
  'pause_tier',
  'resume_tier',
  'queue_stats',
  'tier_report',
  'create_agent',
  'update_agent',
  'delete_agent',
  'get_agent',
  'list_agents',
  'create_protocol',
  'update_protocol',
  'disable_protocol',
  'get_protocol',
  'list_protocols',
  'topup_budget',
  'set_daily_budget',
  'show_budget',
  'create_guarantee',
  'cancel_guarantee',
  'list_guarantees',
  'get_guarantee',
  'create_delegation',
  'revoke_delegation',
  'list_delegations',
  'get_delegation',
  'start_heartbeat',
  'stop_heartbeat',
  'liveness_report',
  'export_sponsorships',
  'audit_log',
  'generate_report',
  'confirm',
  'commands',
];

/** Incoming request from OpenClaw (POST /api/openclaw) */
export interface OpenClawRequest {
  command: string;
  args?: string[];
  sessionId: string;
  /** URL OpenClaw will call back with async results */
  callbackUrl?: string;
}

/** A parsed, typed command ready for execution */
export interface ParsedCommand {
  name: CommandName;
  args: Record<string, string>;
  rawInput: string;
}

/** Result returned by executeCommand() */
export interface CommandResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/** Immediate HTTP response to OpenClaw */
export interface OpenClawResponse {
  ok: boolean;
  acknowledged: boolean;
  /** Shown immediately to user (for sync commands) */
  response?: string;
  /** When true, full response will arrive via callbackUrl */
  asyncPending?: boolean;
}

/** Entry appended to MEMORY.md */
export interface MemoryEntry {
  category: string;
  message: string;
  timestamp?: Date;
}
