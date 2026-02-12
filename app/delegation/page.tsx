'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { Address } from '@/components/common/address';
import { Badge } from '@/components/ui/badge';

const DELEGATION_API_KEY_KEY = 'aegis_delegation_api_key';

interface Delegation {
  id: string;
  delegator: string;
  agent: string;
  status: string;
  validUntil: string;
  gasBudgetRemaining: string;
  gasBudgetWei: string;
  usageCount: number;
}

export default function DelegationListPage() {
  const [apiKey, setApiKey] = useState('');
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDelegator, setFilterDelegator] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [keyPersisted, setKeyPersisted] = useState(false);

  const effectiveKey = apiKey || (typeof window !== 'undefined' ? sessionStorage.getItem(DELEGATION_API_KEY_KEY) : null) || '';

  const fetchDelegations = useCallback(async () => {
    if (!effectiveKey) {
      setDelegations([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDelegator.trim()) params.set('delegator', filterDelegator.trim());
      if (filterAgent.trim()) params.set('agent', filterAgent.trim());
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '50');
      const res = await fetch(`/api/delegation?${params}`, {
        headers: { Authorization: `Bearer ${effectiveKey}` },
      });
      const data = await res.json();
      if (res.ok && data.delegations) {
        setDelegations(data.delegations);
      } else {
        setDelegations([]);
      }
    } catch {
      setDelegations([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveKey, filterDelegator, filterAgent, filterStatus]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      sessionStorage.setItem(DELEGATION_API_KEY_KEY, apiKey.trim());
      setKeyPersisted(true);
      fetchDelegations();
    }
  };

  const handleClearKey = () => {
    sessionStorage.removeItem(DELEGATION_API_KEY_KEY);
    setApiKey('');
    setKeyPersisted(false);
    setDelegations([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-text-primary">Delegations</h1>
          <p className="text-text-secondary mt-1">
            List and manage user-to-agent delegations. API key required.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-cyan-400" />
              API key
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted mb-3">
              Delegation endpoints require Bearer token. Enter your AEGIS_API_KEY to list
              delegations (stored in session only).
            </p>
            <div className="flex gap-4 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <Input
                  type="password"
                  placeholder="AEGIS_API_KEY"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button onClick={handleSaveKey} disabled={!apiKey.trim()}>
                Use key
              </Button>
              {effectiveKey && (
                <Button variant="secondary" onClick={handleClearKey}>
                  Clear key
                </Button>
              )}
            </div>
            {keyPersisted && (
              <p className="text-xs text-success mt-2">Key stored for this session.</p>
            )}
          </CardContent>
        </Card>

        {effectiveKey && (
          <>
            <div className="flex flex-wrap gap-4 mb-4">
              <Input
                placeholder="Filter by delegator (0x...)"
                value={filterDelegator}
                onChange={(e) => setFilterDelegator(e.target.value)}
                className="max-w-xs font-mono text-sm"
              />
              <Input
                placeholder="Filter by agent (0x...)"
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="max-w-xs font-mono text-sm"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="REVOKED">REVOKED</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="EXHAUSTED">EXHAUSTED</option>
                <option value="ALL">ALL</option>
              </select>
              <Button variant="secondary" onClick={fetchDelegations} disabled={loading}>
                Refresh
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Delegations</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <SkeletonTable rows={5} />
                ) : delegations.length === 0 ? (
                  <EmptyState
                    title="No delegations"
                    description="Create a delegation via the API or adjust filters. See the Delegation doc for POST /api/delegation."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Delegator</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Valid until</TableHead>
                          <TableHead className="text-right">Usage</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {delegations.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs truncate max-w-[120px]">
                              {d.id}
                            </TableCell>
                            <TableCell>
                              <Address address={d.delegator} chars={6} />
                            </TableCell>
                            <TableCell>
                              <Address address={d.agent} chars={6} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  d.status === 'ACTIVE'
                                    ? 'success'
                                    : d.status === 'REVOKED'
                                      ? 'error'
                                      : 'default'
                                }
                              >
                                {d.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-text-muted text-sm">
                              {new Date(d.validUntil).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {d.usageCount ?? 0}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/delegation/${d.id}`}
                                className="text-cyan-400 hover:underline text-sm"
                              >
                                View
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!effectiveKey && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-text-muted text-sm">
                Enter an API key above to list delegations, or read the{' '}
                <Link href="/docs/delegation" className="text-cyan-400 hover:underline">
                  Delegation
                </Link>{' '}
                doc to create and manage delegations via API.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
