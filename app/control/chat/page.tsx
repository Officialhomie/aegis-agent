'use client';

import { useCallback, useState } from 'react';
import { CredentialsBar } from '@/components/control/credentials-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { controlFetch, getStoredSessionId } from '@/lib/control-client';
import { Card, CardContent } from '@/components/ui/card';

type Msg = { role: 'user' | 'assistant'; text: string };

export default function ControlChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Commands go through POST /api/control/execute (policy gate). Allowlist sponsor, cycle, and campaign on the Policy page first.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    const sid = getStoredSessionId();
    const res = await controlFetch('/api/control/execute', {
      method: 'POST',
      body: JSON.stringify({ command: text, sessionId: sid }),
    });
    const data = await res.json().catch(() => ({ response: res.statusText }));
    setLoading(false);
    const reply =
      typeof data.summaryText === 'string'
        ? data.summaryText
        : typeof data.response === 'string'
          ? data.response
          : JSON.stringify(data, null, 2);
    setMessages((m) => [...m, { role: 'assistant', text: reply }]);
  }, [input]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <h1 className="text-2xl font-semibold">Gated chat</h1>
      <p className="text-sm text-muted-foreground">
        Uses Aeg-control policy gate + OpenClaw execution + audit trail.
      </p>
      <CredentialsBar />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-border p-4">
          {messages.map((msg, i) => (
            <Card key={i} className={msg.role === 'user' ? 'ml-8' : 'mr-8'}>
              <CardContent className="p-3 text-sm">
                <span className="text-xs font-semibold text-muted-foreground">
                  {msg.role === 'user' ? 'You' : 'Aeg-control'}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{msg.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try: status  or  sponsor …"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
            disabled={loading}
          />
          <Button onClick={() => void send()} disabled={loading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
