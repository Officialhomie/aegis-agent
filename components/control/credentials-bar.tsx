'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getStoredApiKey,
  getStoredSessionId,
  setStoredApiKey,
  setStoredSessionId,
} from '@/lib/control-client';

export function CredentialsBar() {
  const [apiKey, setApiKey] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setSessionId(getStoredSessionId());
  }, []);

  function save() {
    setStoredApiKey(apiKey.trim());
    setStoredSessionId(sessionId.trim() || 'control-demo-session');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        Stored in this browser only. Use the same <code className="text-xs">AEGIS_API_KEY</code> as
        your server.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="aeg-api-key">API key</Label>
          <Input
            id="aeg-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AEGIS_API_KEY"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="aeg-session">Session ID</Label>
          <Input
            id="aeg-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="control-demo-session"
            className="mt-1"
          />
        </div>
      </div>
      <Button type="button" size="sm" className="mt-3" onClick={save}>
        {saved ? 'Saved' : 'Save credentials'}
      </Button>
    </div>
  );
}
