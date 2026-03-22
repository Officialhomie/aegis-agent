'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  getStoredApiKey,
  getStoredSessionId,
  setStoredApiKey,
  setStoredSessionId,
} from '@/lib/control-client';

export function ControlCredentialsForm() {
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
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">Credentials (browser only)</p>
      <p className="text-xs text-muted-foreground">
        Use the same <code className="rounded bg-muted px-1">AEGIS_API_KEY</code> as other Aegis API
        routes. In development, an empty key is allowed when{' '}
        <code className="rounded bg-muted px-1">NODE_ENV=development</code>.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label htmlFor="aeg-api-key">API key</Label>
          <Input
            id="aeg-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Bearer token value"
          />
        </div>
        <div>
          <Label htmlFor="aeg-session">Session ID</Label>
          <Input
            id="aeg-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="control-demo-session"
          />
        </div>
      </div>
      <Button type="button" size="sm" onClick={save}>
        {saved ? 'Saved' : 'Save to browser'}
      </Button>
    </div>
  );
}
