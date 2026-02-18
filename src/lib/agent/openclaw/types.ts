/**
 * Types for the OpenClaw integration layer.
 *
 * OpenClaw is the local-first agent framework that lets users communicate
 * with Aegis via WhatsApp, Telegram, or Signal.
 */

export type CommandName =
  | 'status'
  | 'cycle'
  | 'sponsor'
  | 'report'
  | 'pause'
  | 'resume'
  | 'help';

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
