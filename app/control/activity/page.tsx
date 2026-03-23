'use client';

import { useCallback, useEffect, useState } from 'react';
import { CredentialsBar } from '@/components/control/credentials-bar';
import { Button } from '@/components/ui/button';
import { controlFetch, getStoredSessionId } from '@/lib/control-client';

export default function ControlActivityPage() {
  const [json, setJson] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sid = getStoredSessionId();
    const res = await controlFetch(`/api/control/activity?sessionId=${encodeURIComponent(sid)}`);
    const data = await res.json();
    setJson(JSON.stringify(data, null, 2));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function download() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aeg-control-activity-${getStoredSessionId()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Activity</h1>
      <p className="text-sm text-muted-foreground">
        Product execution records plus OpenClaw audit rows for this session.
      </p>
      <CredentialsBar />
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
        <Button variant="secondary" size="sm" onClick={download} disabled={!json}>
          Export JSON
        </Button>
      </div>
      <pre className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs">
        {json || (loading ? 'Loading…' : '{}')}
      </pre>
    </div>
  );
}
