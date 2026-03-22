/**
 * Aeg-control gated OpenClaw execution — runs ProductPolicyGate before any command.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseCommand } from '@/src/lib/agent/openclaw/command-handler';
import { runOpenClawHttpCommand } from '@/src/lib/agent/openclaw/http-runner';
import { resolveOpenClawProtocolId } from '@/src/lib/agent/openclaw/http-runner';
import { evaluateProductPolicyGate } from '@/src/lib/product/gate/policy-gate';
import { recordProductExecution } from '@/src/lib/product/services/product-audit-service';
import { buildSummary } from '@/src/lib/product/summaries/build-summary';
import { extractTxAndDecision } from '@/src/lib/product/execution/extract-outcome';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

const BodySchema = z.object({
  command: z.string().min(1),
  sessionId: z.string().min(1),
  callbackUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { command, sessionId, callbackUrl } = parsed.data;
  const cmd = parseCommand(command);
  const protocolId = await resolveOpenClawProtocolId(sessionId);

  const gate = await evaluateProductPolicyGate({
    sessionId,
    protocolId,
    commandName: cmd.name,
  });

  const recordProtocolId =
    protocolId === '__no_openclaw_session__' && gate.policyProtocolId
      ? gate.policyProtocolId
      : protocolId === '__no_openclaw_session__'
        ? 'unbound'
        : protocolId;

  if (gate.decision === 'DENIED' || gate.decision === 'PREMIUM_BLOCKED') {
    const summaryText = buildSummary({
      rawUserText: command,
      parsedCommand: cmd.name,
      policyDecision: gate.decision,
      policyReason: gate.reason,
    });
    await recordProductExecution({
      sessionId,
      protocolId: recordProtocolId,
      rawUserText: command,
      parsedCommand: cmd.name,
      policyDecision: gate.decision,
      policyReason: gate.reason,
      policyId: gate.policyId ?? null,
      policySnapshotId: gate.snapshotId ?? null,
      summaryText,
      success: false,
    });
    return NextResponse.json({
      ok: false,
      acknowledged: true,
      policyDecision: gate.decision,
      response: summaryText,
    });
  }

  const { result, openClawAuditId, asyncPending } = await runOpenClawHttpCommand({
    command,
    sessionId,
    callbackUrl,
  });

  const { txHash, decisionHash } = extractTxAndDecision(result.data);

  const summaryText = buildSummary({
    rawUserText: command,
    parsedCommand: cmd.name,
    policyDecision: gate.decision,
    policyReason: gate.reason,
    result,
    txHash,
    decisionHash,
  });

  await recordProductExecution({
    sessionId,
    protocolId: recordProtocolId,
    rawUserText: command,
    parsedCommand: cmd.name,
    policyDecision: gate.decision,
    policyReason: gate.reason,
    policyId: gate.policyId ?? null,
    policySnapshotId: gate.snapshotId ?? null,
    openClawAuditId,
    summaryText,
    success: result.success,
    txHash,
    decisionHash,
  });

  if (asyncPending) {
    return NextResponse.json({
      ok: result.success,
      acknowledged: true,
      asyncPending: true,
      immediate: result.message,
      policyDecision: gate.decision,
      summaryText,
      openClawAuditId,
    });
  }

  return NextResponse.json({
    ok: result.success,
    acknowledged: true,
    response: result.message,
    data: result.data,
    policyDecision: gate.decision,
    summaryText,
    openClawAuditId,
  });
}
