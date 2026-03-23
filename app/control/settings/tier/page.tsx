'use client';

import { useCallback, useEffect, useState } from 'react';
import { CredentialsBar } from '@/components/control/credentials-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { controlFetch, getStoredSessionId } from '@/lib/control-client';

export default function ControlTierPage() {
  const [tier, setTier] = useState('FREE');
  const [caps, setCaps] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const sid = getStoredSessionId();
    const res = await controlFetch(`/api/control/entitlement?sessionId=${encodeURIComponent(sid)}`);
    const data = await res.json();
    if (data.entitlement) setTier(data.entitlement.tier);
    if (data.caps) setCaps(data.caps);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setTierMock(next: 'FREE' | 'PRO' | 'TEAM') {
    const sid = getStoredSessionId();
    await controlFetch('/api/control/entitlement', {
      method: 'POST',
      body: JSON.stringify({ sessionId: sid, tier: next }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Entitlement (mock)</h1>
      <p className="text-sm text-muted-foreground">
        No real billing — tier changes unlock premium OpenClaw commands and higher daily sponsored
        caps.
      </p>
      <CredentialsBar />
      <Card className="mt-4 max-w-lg">
        <CardHeader>
          <CardTitle>Current tier: {tier}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {caps && (
            <pre className="overflow-auto rounded bg-muted/50 p-2 text-xs">
              {JSON.stringify(caps, null, 2)}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void setTierMock('FREE')}>
              Free
            </Button>
            <Button size="sm" onClick={() => void setTierMock('PRO')}>
              Upgrade to Pro (mock)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void setTierMock('TEAM')}>
              Team (mock)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
