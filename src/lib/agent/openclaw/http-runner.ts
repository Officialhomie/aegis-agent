/**
 * Shared OpenClaw HTTP execution path for POST handlers (/api/openclaw, /api/control/execute).
 */

import { parseCommand, executeCommand } from './command-handler';
import { executeWithAudit } from './audit';
import { getSession } from './session-manager';
import { setLatestSession } from './proactive-reporter';
import { appendActionLog } from './memory-manager';
import type { CommandResult, ParsedCommand } from './types';

export async function resolveOpenClawProtocolId(sessionId: string): Promise<string> {
  const session = await getSession(sessionId);
  return session?.protocolId ?? '__no_openclaw_session__';
}

export interface OpenClawRunInput {
  command: string;
  sessionId: string;
  callbackUrl?: string;
}

export interface OpenClawRunOutput {
  cmd: ParsedCommand;
  result: CommandResult;
  openClawAuditId: string | null;
  asyncPending?: boolean;
}

/**
 * Parse, optionally register callback, execute with DB audit trail.
 */
export async function runOpenClawHttpCommand(input: OpenClawRunInput): Promise<OpenClawRunOutput> {
  const { command, sessionId, callbackUrl } = input;
  const cmd = parseCommand(command);
  const protocolId = await resolveOpenClawProtocolId(sessionId);

  if (callbackUrl) {
    await setLatestSession(sessionId, callbackUrl);
  }

  if (cmd.name === 'cycle' && callbackUrl) {
    const { result, openClawAuditId } = await executeWithAudit(cmd, sessionId, protocolId, () =>
      executeCommand(cmd, sessionId)
    );
    await appendActionLog('USER_CMD', `cycle triggered from session ${sessionId}`);
    return { cmd, result, openClawAuditId, asyncPending: true };
  }

  const { result, openClawAuditId } = await executeWithAudit(cmd, sessionId, protocolId, () =>
    executeCommand(cmd, sessionId)
  );
  await appendActionLog(
    'USER_CMD',
    `[${sessionId}] ${command} -> ${result.message.slice(0, 100)}`
  );

  return { cmd, result, openClawAuditId };
}
