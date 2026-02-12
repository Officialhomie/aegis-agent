'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Shield, Activity, AlertTriangle, ExternalLink } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUSD } from '@/lib/utils';

interface HealthResponse {
  status: string;
  healthScore?: number;
  ethBalance?: number;
  usdcBalance?: number;
  runwayDays?: number;
  emergencyMode?: boolean;
  protocolBudgets?: Array<{
    protocolId: string;
    balanceUSD: number;
    estimatedDaysRemaining: number;
  }>;
  lastUpdated?: string;
  message?: string;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (res.ok) {
        setHealth(data);
      } else {
        setError(data.message ?? 'Failed to load health');
      }
    } catch {
      setError('Failed to load health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isHealthy = health?.status === 'healthy';
  const isDegraded = health?.status === 'degraded';
  const isEmergency = health?.status === 'emergency';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-text-primary">Status</h1>
          <p className="text-text-secondary mt-1">
            System health and reserve status for the Aegis paymaster
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-error">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
              <button
                onClick={fetchHealth}
                className="mt-4 text-sm text-cyan-400 hover:text-cyan-300"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : health ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  Overall Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-4">
                  <Badge
                    variant={isEmergency ? 'error' : isDegraded ? 'warning' : 'success'}
                  >
                    {health.status.toUpperCase()}
                  </Badge>
                  {health.healthScore != null && (
                    <span className="text-text-secondary">
                      Health score: <strong className="text-text-primary">{health.healthScore}</strong>
                    </span>
                  )}
                  {health.emergencyMode && (
                    <span className="text-warning text-sm font-medium">Emergency mode active</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {health.ethBalance != null && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-text-muted mb-1">ETH Reserve</div>
                    <div className="font-display text-xl font-bold text-text-primary">
                      {health.ethBalance.toFixed(4)} ETH
                    </div>
                  </CardContent>
                </Card>
              )}
              {health.usdcBalance != null && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-text-muted mb-1">USDC Reserve</div>
                    <div className="font-display text-xl font-bold text-text-primary">
                      {formatUSD(health.usdcBalance)}
                    </div>
                  </CardContent>
                </Card>
              )}
              {health.runwayDays != null && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-text-muted mb-1">Runway</div>
                    <div className="font-display text-xl font-bold text-text-primary">
                      {health.runwayDays.toFixed(1)} days
                    </div>
                  </CardContent>
                </Card>
              )}
              {health.lastUpdated && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-text-muted mb-1">Last updated</div>
                    <div className="text-sm text-text-secondary">
                      {new Date(health.lastUpdated).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {health.protocolBudgets && health.protocolBudgets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-coral-400" />
                    Protocol budgets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted">
                          <th className="py-2 pr-4">Protocol</th>
                          <th className="py-2 pr-4 text-right">Balance (USD)</th>
                          <th className="py-2 text-right">Est. days</th>
                        </tr>
                      </thead>
                      <tbody className="text-text-secondary">
                        {health.protocolBudgets.map((b) => (
                          <tr key={b.protocolId} className="border-b border-border/50">
                            <td className="py-2 pr-4 font-mono">{b.protocolId}</td>
                            <td className="py-2 pr-4 text-right">{formatUSD(b.balanceUSD)}</td>
                            <td className="py-2 text-right">{b.estimatedDaysRemaining?.toFixed(1) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="pt-4">
              <Link
                href="/docs/api"
                className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
              >
                API Reference (health endpoints)
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
