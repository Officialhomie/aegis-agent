'use client';

import { useState } from 'react';
import { Award, Search } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Address } from '@/components/common/address';

interface PassportData {
  agent?: string;
  agentOnChainId?: string;
  sponsorCount: number;
  successRateBps: number;
  protocolCount: number;
  firstSponsorTime: number;
  totalValueSponsored: number;
  reputationHash: string | null;
}

export default function GasPassportDocsPage() {
  const [lookupInput, setLookupInput] = useState('');
  const [lookupBy, setLookupBy] = useState<'agent' | 'agentOnChainId'>('agent');
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleLookup = async () => {
    const trimmed = lookupInput.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError(null);
    setPassport(null);
    try {
      const param = lookupBy === 'agent' ? 'agent' : 'agentOnChainId';
      const res = await fetch(`/api/v1/passport?${param}=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && !data.error) {
        setPassport(data);
      } else {
        setLookupError(data.error ?? 'Lookup failed');
      }
    } catch {
      setLookupError('Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Award className="h-6 w-6 text-cyan-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            Gas Passport
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          A reputation primitive built from Aegis sponsorship history. Agents get a
          portable passport (sponsor count, success rate, protocol diversity, longevity,
          total value sponsored) that can be used for preferential sponsorship and
          third-party trust.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          What is Gas Passport?
        </h2>
        <p className="text-text-secondary">
          Gas Passport aggregates on-chain and database sponsorship records into a single
          view per agent. It encodes: total sponsorships received, success rate (bundler
          success), number of distinct protocols, first sponsorship timestamp, and total
          value sponsored in USD. No self-reporting — the paymaster sees every
          transaction.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">Fields</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li><code className="text-cyan-400">sponsorCount</code> — total sponsorships</li>
              <li><code className="text-cyan-400">successRateBps</code> — success rate (10000 = 100%)</li>
              <li><code className="text-cyan-400">protocolCount</code> — unique protocols</li>
              <li><code className="text-cyan-400">firstSponsorTime</code> — Unix timestamp</li>
              <li><code className="text-cyan-400">totalValueSponsored</code> — USD</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">Preferential sponsorship</h3>
            <p className="text-sm text-text-muted">
              Agents that meet a minimum sponsor count and success rate (e.g. 10+
              sponsorships, 95%+ success) can pass the legitimacy check with a lower
              on-chain transaction history requirement. This is configurable via
              GAS_PASSPORT_PREFERENTIAL_* env vars.
            </p>
          </div>
        </div>
        <Callout variant="tip" title="Preferential treatment">
          High-passport agents get a lower bar for the historical-tx rule so they are
          less likely to be rejected when they already have a strong Aegis track record.
        </Callout>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          API
        </h2>
        <p className="text-text-secondary">
          Query by agent wallet address or by ERC-8004 on-chain ID. Public endpoint; no
          auth required.
        </p>
        <CodeBlock
          code={`GET /api/v1/passport?agent=0x1234567890123456789012345678901234567890
# or
GET /api/v1/passport?agentOnChainId=42`}
          language="text"
        />
        <p className="text-sm text-text-muted">
          See the <a href="/docs/api" className="text-cyan-400 hover:underline">API Reference</a> (v1 tab) for full request/response details.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Look up passport
        </h2>
        <p className="text-text-secondary">
          Enter an agent wallet address (0x...) or an ERC-8004 agent on-chain ID to view
          their Gas Passport.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-text-muted mb-1">Look up by</label>
            <select
              value={lookupBy}
              onChange={(e) => setLookupBy(e.target.value as 'agent' | 'agentOnChainId')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text-primary text-sm"
            >
              <option value="agent">Agent address (0x...)</option>
              <option value="agentOnChainId">Agent on-chain ID</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-text-muted mb-1">
              {lookupBy === 'agent' ? 'Agent address' : 'Agent on-chain ID'}
            </label>
            <Input
              placeholder={lookupBy === 'agent' ? '0x...' : 'e.g. 42'}
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button onClick={handleLookup} disabled={lookupLoading || !lookupInput.trim()}>
            <Search className="h-4 w-4" />
            Look up
          </Button>
        </div>
        {lookupError && (
          <p className="text-sm text-error">{lookupError}</p>
        )}
        {passport && (
          <Card>
            <CardHeader>
              <CardTitle>Passport data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {passport.agent && (
                  <div>
                    <span className="text-text-muted">Agent </span>
                    <Address address={passport.agent} chars={8} />
                  </div>
                )}
                {passport.agentOnChainId && (
                  <div>
                    <span className="text-text-muted">On-chain ID </span>
                    <span className="font-mono text-text-primary">{passport.agentOnChainId}</span>
                  </div>
                )}
                <div>
                  <span className="text-text-muted">Sponsorships </span>
                  <span className="font-mono text-text-primary">{passport.sponsorCount}</span>
                </div>
                <div>
                  <span className="text-text-muted">Success rate </span>
                  <span className="font-mono text-text-primary">{(passport.successRateBps / 100).toFixed(2)}%</span>
                </div>
                <div>
                  <span className="text-text-muted">Protocols </span>
                  <span className="font-mono text-text-primary">{passport.protocolCount}</span>
                </div>
                <div>
                  <span className="text-text-muted">First sponsor </span>
                  <span className="font-mono text-text-primary">
                    {passport.firstSponsorTime
                      ? new Date(passport.firstSponsorTime * 1000).toISOString()
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Total value sponsored </span>
                  <span className="font-mono text-text-primary">${passport.totalValueSponsored.toFixed(2)} USD</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
