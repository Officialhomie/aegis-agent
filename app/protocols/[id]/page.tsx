'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Wallet, Activity, Clock } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Address } from '@/components/common/address';
import { formatUSD } from '@/lib/utils';

interface Protocol {
  protocolId: string;
  name: string;
  balanceUSD: number;
  totalSpent: number;
  sponsorshipCount: number;
  tier: 'bronze' | 'silver' | 'gold';
  whitelistedContracts: string[];
  createdAt: string;
}

export default function ProtocolDetailPage() {
  const params = useParams();
  const protocolId = params.id as string;

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Top-up state
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupSuccess, setTopupSuccess] = useState(false);

  useEffect(() => {
    async function fetchProtocol() {
      try {
        const res = await fetch(`/api/protocol/${protocolId}`);
        if (res.ok) {
          const data = await res.json();
          setProtocol(data);
        } else if (res.status === 404) {
          setError('Protocol not found');
        } else {
          setError('Failed to load protocol');
        }
      } catch {
        setError('Failed to load protocol');
      } finally {
        setLoading(false);
      }
    }

    fetchProtocol();
  }, [protocolId]);

  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) return;

    setTopupLoading(true);
    setTopupSuccess(false);

    try {
      const res = await fetch(`/api/protocol/${protocolId}/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUSD: amount }),
      });

      if (res.ok) {
        const data = await res.json();
        setProtocol((prev) => (prev ? { ...prev, balanceUSD: data.balanceUSD } : null));
        setTopupAmount('');
        setTopupSuccess(true);
        setTimeout(() => setTopupSuccess(false), 3000);
      }
    } catch {
      // Handle error silently
    } finally {
      setTopupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </main>
      </div>
    );
  }

  if (error || !protocol) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
              {error || 'Protocol not found'}
            </h1>
            <Link href="/protocols">
              <Button variant="secondary">Back to Protocols</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Back link */}
        <Link
          href="/protocols"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Protocols
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-3xl font-bold text-text-primary">
                {protocol.name}
              </h1>
              <Badge variant={protocol.tier}>{protocol.tier}</Badge>
            </div>
            <p className="text-text-muted font-mono text-sm">{protocol.protocolId}</p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Wallet className="h-5 w-5 text-cyan-400" />
                </div>
                <span className="text-sm text-text-muted">Balance</span>
              </div>
              <div className="font-display text-2xl font-bold text-text-primary">
                {formatUSD(protocol.balanceUSD)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-coral-500/10">
                  <Activity className="h-5 w-5 text-coral-400" />
                </div>
                <span className="text-sm text-text-muted">Total Spent</span>
              </div>
              <div className="font-display text-2xl font-bold text-text-primary">
                {formatUSD(protocol.totalSpent)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Clock className="h-5 w-5 text-success" />
                </div>
                <span className="text-sm text-text-muted">Sponsorships</span>
              </div>
              <div className="font-display text-2xl font-bold text-text-primary">
                {protocol.sponsorshipCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top-up section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Top Up Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 max-w-xs">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Amount (USD)"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                />
              </div>
              <Button
                onClick={handleTopup}
                loading={topupLoading}
                disabled={!topupAmount || parseFloat(topupAmount) <= 0}
              >
                <Plus className="h-4 w-4" />
                Top Up
              </Button>
            </div>
            {topupSuccess && (
              <p className="text-sm text-success mt-2">Balance updated successfully!</p>
            )}
          </CardContent>
        </Card>

        {/* Whitelisted Contracts */}
        <Card>
          <CardHeader>
            <CardTitle>Whitelisted Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            {protocol.whitelistedContracts.length === 0 ? (
              <p className="text-text-muted text-sm">No contracts whitelisted yet.</p>
            ) : (
              <div className="space-y-2">
                {protocol.whitelistedContracts.map((address) => (
                  <div
                    key={address}
                    className="flex items-center justify-between bg-elevated rounded-lg px-4 py-3"
                  >
                    <Address address={address} chars={8} />
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-xs text-text-muted">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
