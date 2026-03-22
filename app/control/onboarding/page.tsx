'use client';

import { useCallback, useEffect, useState } from 'react';
import { CredentialsBar } from '@/components/control/credentials-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { controlFetch, getStoredSessionId } from '@/lib/control-client';
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps';

const STEP_LABEL: Record<string, string> = {
  STEP_1_IDENTITY: 'Identity — wallet or agent address',
  STEP_2_PROTOCOL: 'Protocol context',
  STEP_3_DELEGATION: 'Delegation',
  STEP_4_POLICY: 'Policy preview',
  STEP_5_READY: 'Ready',
};

export default function ControlOnboardingPage() {
  const [step, setStep] = useState<string>('STEP_1_IDENTITY');
  const [completionPct, setCompletionPct] = useState(0);
  const [wallet, setWallet] = useState('');
  const [protocolId, setProtocolId] = useState('test-protocol');
  const [delegationNote, setDelegationNote] = useState('');
  const [policyNote, setPolicyNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const sid = getStoredSessionId();
    const res = await controlFetch(`/api/control/fsm?sessionId=${encodeURIComponent(sid)}`);
    if (res.ok) {
      const data = await res.json();
      setStep(data.step);
      setCompletionPct(data.completionPct ?? 0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function bindSession() {
    setLoading(true);
    setError(null);
    const sid = getStoredSessionId();
    const res = await controlFetch('/api/control/session', {
      method: 'POST',
      body: JSON.stringify({ sessionId: sid, protocolId }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? res.statusText);
      return;
    }
  }

  async function advance(next: (typeof ONBOARDING_STEPS)[number], payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    const sid = getStoredSessionId();
    const res = await controlFetch('/api/control/fsm', {
      method: 'POST',
      body: JSON.stringify({ sessionId: sid, step: next, payload }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? res.statusText);
      return;
    }
    const data = await res.json();
    setStep(data.nextStep);
    setCompletionPct(data.completionPct ?? 0);
  }

  const idx = ONBOARDING_STEPS.indexOf(step as (typeof ONBOARDING_STEPS)[number]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Five-step flow persisted per session. Bind your OpenClaw session to a protocol before using
        gated chat.
      </p>
      <CredentialsBar />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${completionPct}%` }}
        />
      </div>
      <p className="mb-4 text-sm font-medium">
        Step {idx + 1} / {ONBOARDING_STEPS.length}: {STEP_LABEL[step] ?? step}
      </p>

      {step === 'STEP_1_IDENTITY' && (
        <div className="max-w-md space-y-3">
          <Label>Wallet or agent address (reference)</Label>
          <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" />
          <Button
            disabled={loading}
            onClick={() =>
              advance('STEP_2_PROTOCOL', { walletAddress: wallet || undefined })
            }
          >
            Continue
          </Button>
        </div>
      )}

      {step === 'STEP_2_PROTOCOL' && (
        <div className="max-w-md space-y-3">
          <Label>Protocol ID</Label>
          <Input value={protocolId} onChange={(e) => setProtocolId(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="outline" disabled={loading} onClick={() => void bindSession()}>
              Bind OpenClaw session
            </Button>
            <Button
              disabled={loading}
              onClick={() => advance('STEP_3_DELEGATION', { protocolId })}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'STEP_3_DELEGATION' && (
        <div className="max-w-md space-y-3">
          <Label>Delegation notes</Label>
          <Input
            value={delegationNote}
            onChange={(e) => setDelegationNote(e.target.value)}
            placeholder="Linked delegation id or URL (optional)"
          />
          <Button
            disabled={loading}
            onClick={() => advance('STEP_4_POLICY', { delegationNote })}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 'STEP_4_POLICY' && (
        <div className="max-w-md space-y-3">
          <Label>Policy intent</Label>
          <Input
            value={policyNote}
            onChange={(e) => setPolicyNote(e.target.value)}
            placeholder="e.g. Allow sponsor + cycle with $5/day"
          />
          <Button
            disabled={loading}
            onClick={() => advance('STEP_5_READY', { policyNote })}
          >
            Continue
          </Button>
          <p className="text-xs text-muted-foreground">
            Configure allowlists on the Policy settings page next.
          </p>
        </div>
      )}

      {step === 'STEP_5_READY' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Onboarding complete for this session. Open Policy to allowlist sponsored methods, then
            use Chat (gated execute).
          </p>
          <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
            Refresh state
          </Button>
        </div>
      )}
    </div>
  );
}
