'use client';

import { useCallback, useEffect, useState } from 'react';
import { CredentialsBar } from '@/components/control/credentials-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { controlFetch, getStoredSessionId } from '@/lib/control-client';

type Method = {
  id: string;
  commandName: string;
  displayName: string;
  isPremium: boolean;
  riskTier: string;
};

type PolicyRow = {
  id: string;
  status: string;
  dailyLimit: number;
  totalLimit: number;
  sponsoredMethod: Method;
};

export default function ControlPolicySettingsPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [protocolId, setProtocolId] = useState('test-protocol');
  const [commandName, setCommandName] = useState('sponsor');
  const [dailyLimit, setDailyLimit] = useState(10);
  const [totalLimit, setTotalLimit] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sid = getStoredSessionId();
    const [m, p] = await Promise.all([
      controlFetch('/api/control/methods'),
      controlFetch(`/api/control/policy?sessionId=${encodeURIComponent(sid)}`),
    ]);
    const mj = await m.json();
    const pj = await p.json();
    if (mj.methods) setMethods(mj.methods);
    if (pj.policies) setPolicies(pj.policies);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addPolicy() {
    setError(null);
    const sid = getStoredSessionId();
    const res = await controlFetch('/api/control/policy', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: sid,
        protocolId,
        commandName,
        dailyLimit,
        totalLimit,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? res.statusText);
      return;
    }
    await refresh();
  }

  async function revoke(id: string) {
    await controlFetch(`/api/control/policy/${id}/revoke`, { method: 'POST' });
    await refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Policy & allowlist</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Allowlist sponsored commands (<code>sponsor</code>, <code>cycle</code>, <code>campaign</code>)
        with per-method caps. Revoke removes sponsorship eligibility immediately.
      </p>
      <CredentialsBar />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-4 grid max-w-xl gap-3 rounded-lg border border-border p-4">
        <div>
          <Label>Protocol ID</Label>
          <Input value={protocolId} onChange={(e) => setProtocolId(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Command</Label>
          <select
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={commandName}
            onChange={(e) => setCommandName(e.target.value)}
          >
            {(methods.length
              ? methods
              : [
                  { id: 'x', commandName: 'sponsor', isPremium: false, riskTier: 'MEDIUM' },
                  { id: 'y', commandName: 'cycle', isPremium: false, riskTier: 'MEDIUM' },
                  { id: 'z', commandName: 'campaign', isPremium: false, riskTier: 'MEDIUM' },
                  { id: 's', commandName: 'status', isPremium: false, riskTier: 'LOW' },
                ]
            ).map((m) => (
              <option key={m.id} value={m.commandName}>
                {m.commandName} {m.isPremium ? '(premium)' : ''} — {m.riskTier}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Daily limit</Label>
            <Input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Total limit</Label>
            <Input
              type="number"
              value={totalLimit}
              onChange={(e) => setTotalLimit(Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
        <Button type="button" onClick={() => void addPolicy()}>
          Save allowlist entry
        </Button>
      </div>

      <h2 className="mt-8 text-lg font-medium">Active policies</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Command</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Daily / Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.sponsoredMethod.commandName}</TableCell>
              <TableCell>{p.status}</TableCell>
              <TableCell>
                {p.dailyLimit} / {p.totalLimit}
              </TableCell>
              <TableCell>
                {p.status !== 'REVOKED' && (
                  <Button variant="destructive" size="sm" onClick={() => void revoke(p.id)}>
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
