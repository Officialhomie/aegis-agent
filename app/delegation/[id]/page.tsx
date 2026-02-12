'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Trash2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Address } from '@/components/common/address';
import { Badge } from '@/components/ui/badge';
import { TxLink } from '@/components/common/tx-link';

const DELEGATION_API_KEY_KEY = 'aegis_delegation_api_key';

interface Delegation {
  id: string;
  delegator: string;
  agent: string;
  agentOnChainId: string | null;
  status: string;
  validFrom: string;
  validUntil: string;
  gasBudgetWei: string;
  gasBudgetSpent: string;
  gasBudgetRemaining: string;
  usageCount: number;
  totalGasUsed: string;
  permissions: Record<string, unknown>;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UsageRecord {
  id: string;
  targetContract: string;
  gasUsed: string;
  gasCostWei: string;
  txHash: string | null;
  success: boolean;
  createdAt: string;
}

export default function DelegationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [delegation, setDelegation] = useState<Delegation | null>(null);
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = typeof window !== 'undefined' ? sessionStorage.getItem(DELEGATION_API_KEY_KEY) : null;

  const fetchData = useCallback(async () => {
    if (!apiKey) {
      setError('API key required');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [delegRes, usageRes] = await Promise.all([
        fetch(`/api/delegation/${id}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch(`/api/delegation/${id}/usage?limit=50`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ]);
      const delegData = await delegRes.json();
      const usageData = await usageRes.json();
      if (delegRes.ok && delegData.delegation) {
        setDelegation(delegData.delegation);
      } else {
        setError(delegData.error ?? 'Failed to load delegation');
      }
      if (usageRes.ok && usageData.usage) {
        setUsage(usageData.usage);
      } else {
        setUsage([]);
      }
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, apiKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRevoke = async () => {
    if (!apiKey || !delegation) return;
    setRevokeLoading(true);
    try {
      const res = await fetch(`/api/delegation/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Delegator-Address': delegation.delegator,
        },
        body: JSON.stringify({ reason: revokeReason.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowRevokeConfirm(false);
        setRevokeReason('');
        fetchData();
      } else {
        setError(data.error ?? data.message ?? 'Revoke failed');
      }
    } catch {
      setError('Revoke failed');
    } finally {
      setRevokeLoading(false);
    }
  };

  if (loading && !delegation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (error && !delegation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-error mb-4">{error}</p>
          <Link href="/delegation" className="text-cyan-400 hover:underline">
            Back to Delegations
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Link
          href="/delegation"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Delegations
        </Link>

        {delegation && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h1 className="font-display text-3xl font-bold text-text-primary">
                  Delegation
                </h1>
                <p className="font-mono text-sm text-text-muted mt-1 truncate max-w-md">
                  {delegation.id}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    delegation.status === 'ACTIVE'
                      ? 'success'
                      : delegation.status === 'REVOKED'
                        ? 'error'
                        : 'default'
                  }
                >
                  {delegation.status}
                </Badge>
                {delegation.status === 'ACTIVE' && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowRevokeConfirm(true)}
                    className="text-error hover:bg-error/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-text-muted mb-1">Delegator</div>
                  <Address address={delegation.delegator} chars={8} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-text-muted mb-1">Agent</div>
                  <Address address={delegation.agent} chars={8} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-text-muted mb-1">Valid until</div>
                  <div className="text-text-primary">
                    {new Date(delegation.validUntil).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-text-muted mb-1">Budget remaining</div>
                  <div className="font-mono text-text-primary">
                    {delegation.gasBudgetRemaining} wei
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-text-secondary bg-elevated rounded-lg p-4 overflow-x-auto">
                  {JSON.stringify(delegation.permissions, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage ({usage.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {usage.length === 0 ? (
                  <p className="text-text-muted text-sm">No usage records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tx hash</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead className="text-right">Gas used</TableHead>
                          <TableHead>Success</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usage.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>
                              {u.txHash ? (
                                <TxLink txHash={u.txHash} testnet />
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Address address={u.targetContract} chars={6} />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {u.gasUsed}
                            </TableCell>
                            <TableCell>
                              <Badge variant={u.success ? 'success' : 'error'}>
                                {u.success ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-text-muted text-sm">
                              {new Date(u.createdAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {showRevokeConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="max-w-md w-full">
                  <CardHeader>
                    <CardTitle>Revoke delegation?</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-text-secondary">
                      This will revoke the delegation. The delegator address must match.
                    </p>
                    <div>
                      <label className="block text-sm text-text-muted mb-1">
                        Reason (optional)
                      </label>
                      <Input
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        placeholder="e.g. No longer needed"
                      />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setShowRevokeConfirm(false);
                          setRevokeReason('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleRevoke}
                        disabled={revokeLoading}
                        className="text-error hover:bg-error/10"
                      >
                        {revokeLoading ? 'Revoking...' : 'Revoke'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
