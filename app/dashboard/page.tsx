'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Users,
  Shield,
  Wallet,
  Search,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  TrendingDown,
  MessageCircle,
  DollarSign,
  Zap,
  ChevronRight,
  Server,
  BarChart3,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';
import { Address } from '@/components/common/address';
import { TxLink } from '@/components/common/tx-link';
import { EmptyState } from '@/components/common/empty-state';
import { formatUSD, copyToClipboard } from '@/lib/utils';

interface ChainBalance {
  chainId: number;
  chainName: string;
  ETH: number;
  USDC: number;
}

interface Stats {
  sponsorshipsToday: number;
  activeProtocols: number;
  reserveHealth: {
    ETH: number;
    USDC: number;
    healthy: boolean;
    balances?: ChainBalance[];
  };
  timestamp: string;
}

interface ActivityRecord {
  id: string;
  userAddress: string;
  protocolId: string;
  decisionHash: string;
  estimatedCostUSD: number;
  actualCostUSD: number | null;
  txHash: string | null;
  createdAt: string;
}

interface VerifyResult {
  decisionHash: string;
  onChain: boolean;
  signatureValid: boolean;
  record?: {
    userAddress: string;
    protocolId: string;
    estimatedCostUSD: number;
    txHash?: string;
    createdAt: string;
  };
  onChainEvent?: {
    user: string;
    protocolId: string;
    estimatedCostUSD: number;
    timestamp: number;
    transactionHash: string;
  };
  error?: string;
}

interface HealthComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface HealthData {
  status: string;
  timestamp: string;
  components: HealthComponent[];
}

interface BatchDemoResponse {
  protocol: string;
  agentsRegistered: number;
  delegationsActive: number;
  totalOpsSubmitted: number;
  totalOpsSuccess: number;
  totalOpsFailed: number;
  successRate: number;
  archetypes: Array<{
    id: string;
    label: string;
    agentCount: number;
    opsSubmitted: number;
    opsSuccess: number;
    opsFailed: number;
  }>;
  recentTxHashes: string[];
  lastUpdated: string;
}

interface CostSavings {
  neynar: {
    month: string;
    used: number;
    quota: number;
    byCategory: Record<string, { used: number; budget: number }>;
  } | null;
  llm: {
    totalCycles: number;
    skippedByFilter: number;
    skippedByTemplate: number;
    llmCalls: number;
  };
  estimatedSavings: { neynarUSD: number; anthropicUSD: number; totalUSD: number };
  timestamp: string;
}


export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [costSavings, setCostSavings] = useState<CostSavings | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [verifyHash, setVerifyHash] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [batchDemo, setBatchDemo] = useState<BatchDemoResponse | null>(null);
  const [batchDemoReady, setBatchDemoReady] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/activity?limit=20');
      const data = await res.json();
      if (res.ok) setActivity(data.activity ?? []);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchCostSavings = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/cost-savings');
      const data = await res.json();
      if (res.ok) setCostSavings(data);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health/deep');
      const data = await res.json();
      if (res.ok) setHealth(data);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchBatchDemo = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/batch-demo');
      const data = await res.json();
      if (res.ok && !data.error) {
        setBatchDemo(data as BatchDemoResponse);
      } else {
        setBatchDemo(null);
      }
    } catch {
      setBatchDemo(null);
    } finally {
      setBatchDemoReady(true);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchActivity(), fetchCostSavings(), fetchHealth()]);
      setLoading(false);
    };
    loadData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      Promise.all([fetchStats(), fetchActivity(), fetchCostSavings(), fetchHealth()]);
    }, 30_000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStats, fetchActivity, fetchCostSavings, fetchHealth]);

  useEffect(() => {
    void fetchBatchDemo();
    const id = setInterval(() => void fetchBatchDemo(), 5000);
    return () => clearInterval(id);
  }, [fetchBatchDemo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStats(),
      fetchActivity(),
      fetchCostSavings(),
      fetchHealth(),
      fetchBatchDemo(),
    ]);
    setRefreshing(false);
  };

  const handleVerify = async () => {
    const hash = verifyHash.trim();
    if (!hash) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/dashboard/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionHash: hash }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      // Silently fail
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-sm sm:text-base text-text-secondary mt-1">
              Real-time statistics and sponsorship activity
            </p>
          </div>
          <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Activity}
            label="Sponsorships Today"
            value={stats?.sponsorshipsToday}
            loading={loading}
            color="cyan"
          />
          <StatCard
            icon={Users}
            label="Active Protocols"
            value={stats?.activeProtocols}
            loading={loading}
            color="coral"
          />
          <StatCard
            icon={Shield}
            label="Reserve Health"
            value={stats?.reserveHealth?.healthy ? 'Healthy' : 'Low'}
            loading={loading}
            color={stats?.reserveHealth?.healthy ? 'success' : 'warning'}
          />
          <StatCard
            icon={Wallet}
            label="ETH Reserves"
            value={stats?.reserveHealth?.ETH ? `${stats.reserveHealth.ETH.toFixed(4)} ETH` : undefined}
            loading={loading}
            color="default"
          />
        </div>

        {/* System Health */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-cyan-400" />
              System Health
              {health && (
                <Badge variant={health.status === 'healthy' ? 'success' : 'warning'}>
                  {health.status}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : health ? (
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {health.components.map((comp) => (
                  <div key={comp.name} className="bg-elevated rounded-lg p-3 text-center">
                    <div className={`w-2.5 h-2.5 rounded-full mx-auto mb-2 ${
                      comp.status === 'healthy' ? 'bg-success' :
                      comp.status === 'degraded' ? 'bg-warning' : 'bg-error'
                    }`} />
                    <div className="text-xs font-medium text-text-primary capitalize">
                      {comp.name.replace('_', ' ')}
                    </div>
                    {comp.latencyMs != null && (
                      <div className="text-xs text-text-muted mt-1">{comp.latencyMs}ms</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm">Health data unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* Mainnet batch demo (aggregated UserOp stats) */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Batch demo (Base mainnet)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-muted text-sm mb-4">
              Live aggregates for protocol <span className="font-mono text-text-secondary">aegis-batch-demo</span> — same
              metrics as <span className="font-mono">BATCH_DEMO_REPORT.md</span>
            </p>
            {!batchDemoReady ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : !batchDemo || batchDemo.agentsRegistered === 0 ? (
              <p className="text-text-muted text-sm text-center py-6">
                No batch demo data yet. Register agents with{' '}
                <code className="text-xs bg-elevated px-1 rounded">scripts/batch-demo.ts</code>.
              </p>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  <div className="bg-elevated rounded-lg p-3 text-center">
                    <div className="text-xs text-text-muted">Agents</div>
                    <div className="text-xl font-bold text-text-primary">{batchDemo.agentsRegistered}</div>
                  </div>
                  <div className="bg-elevated rounded-lg p-3 text-center">
                    <div className="text-xs text-text-muted">UserOps submitted</div>
                    <div className="text-xl font-bold text-text-primary">{batchDemo.totalOpsSubmitted}</div>
                  </div>
                  <div className="bg-elevated rounded-lg p-3 text-center">
                    <div className="text-xs text-text-muted">Confirmed</div>
                    <div className="text-xl font-bold text-success">{batchDemo.totalOpsSuccess}</div>
                  </div>
                  <div className="bg-elevated rounded-lg p-3 text-center">
                    <div className="text-xs text-text-muted">Success rate</div>
                    <div className="text-xl font-bold text-text-primary">{batchDemo.successRate}%</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border overflow-hidden mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Archetype</TableHead>
                        <TableHead className="text-right">Agents</TableHead>
                        <TableHead className="text-right">Submitted</TableHead>
                        <TableHead className="text-right">OK</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchDemo.archetypes.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.agentCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.opsSubmitted}</TableCell>
                          <TableCell className="text-right tabular-nums text-success">{row.opsSuccess}</TableCell>
                          <TableCell className="text-right tabular-nums text-text-muted">{row.opsFailed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-text-muted mb-2">
                  Updated {batchDemo.lastUpdated ? new Date(batchDemo.lastUpdated).toLocaleString() : '—'}
                </p>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Recent confirmed txs
                  </div>
                  {batchDemo.recentTxHashes.length === 0 ? (
                    <p className="text-text-muted text-sm">No confirmed hashes in the rolling window.</p>
                  ) : (
                    batchDemo.recentTxHashes.map((hash) => (
                      <div key={hash} className="flex items-center justify-between bg-elevated rounded-lg p-3 gap-2">
                        <span className="text-xs font-mono text-text-secondary truncate">
                          {hash.slice(0, 14)}…{hash.slice(-10)}
                        </span>
                        <a
                          href={`https://basescan.org/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 shrink-0"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Cost Optimization (Phase 1) */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-cyan-400" />
              Cost Optimization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
                  <MessageCircle className="h-4 w-4" />
                  Neynar posts
                </div>
                {costSavings?.neynar ? (
                  <>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary">
                      {costSavings.neynar.used} <span className="text-base font-normal text-text-muted">/ {costSavings.neynar.quota}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-elevated overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (costSavings.neynar.used / costSavings.neynar.quota) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                      {Object.entries(costSavings.neynar.byCategory).map(([cat, v]) => (
                        <span key={cat}>{cat}: {v.used}/{v.budget}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-text-muted text-sm">Not available</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
                  <Activity className="h-4 w-4" />
                  LLM calls saved
                </div>
                {costSavings?.llm ? (
                  <>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary">
                      {costSavings.llm.totalCycles === 0
                        ? '0%'
                        : `${Math.round(((costSavings.llm.skippedByFilter + costSavings.llm.skippedByTemplate) / costSavings.llm.totalCycles) * 100)}%`}
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-elevated overflow-hidden">
                      <div
                        className="h-full bg-coral-500 rounded-full transition-all"
                        style={{
                          width: `${costSavings.llm.totalCycles === 0 ? 0 : Math.min(100, ((costSavings.llm.skippedByFilter + costSavings.llm.skippedByTemplate) / costSavings.llm.totalCycles) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Filter: {costSavings.llm.skippedByFilter} · Template: {costSavings.llm.skippedByTemplate} · LLM: {costSavings.llm.llmCalls}
                    </p>
                  </>
                ) : (
                  <p className="text-text-muted text-sm">Not available</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
                  <DollarSign className="h-4 w-4" />
                  Est. savings
                </div>
                {costSavings?.estimatedSavings ? (
                  <div className="text-xl sm:text-2xl font-bold text-success">
                    ${costSavings.estimatedSavings.totalUSD}
                    <span className="text-base font-normal text-text-muted">/month</span>
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">Not available</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Execution Guarantees */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                Execution Guarantees
              </div>
              <Link href="/dashboard/guarantees">
                <Button variant="ghost" size="sm">
                  View All
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-muted text-sm mb-4">
              SLA-backed sponsorship guarantees with GAS_BUDGET, TX_COUNT, and TIME_WINDOW types.
              Bronze (best effort), Silver (95% SLA), and Gold (99% SLA) tiers available.
            </p>
            <Link href="/dashboard/guarantees">
              <Button variant="secondary">
                Manage Guarantees
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Multi-chain balances */}
        {stats?.reserveHealth?.balances && stats.reserveHealth.balances.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Chain Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.reserveHealth.balances.map((chain) => (
                  <div key={chain.chainId} className="bg-elevated rounded-lg p-4">
                    <div className="font-medium text-text-primary mb-2">{chain.chainName}</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">ETH</span>
                      <span className="font-mono text-text-secondary">{chain.ETH.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">USDC</span>
                      <span className="font-mono text-text-secondary">{formatUSD(chain.USDC)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Verification */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Verify Decision</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Enter decision hash (0x...)"
                  value={verifyHash}
                  onChange={(e) => setVerifyHash(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button onClick={handleVerify} loading={verifyLoading} disabled={!verifyHash.trim()}>
                <Search className="h-4 w-4" />
                Verify
              </Button>
            </div>

            {verifyResult && (
              <div className="bg-elevated rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <VerifyBadge label="On-chain" passed={verifyResult.onChain} />
                  <VerifyBadge label="Signature" passed={verifyResult.signatureValid} />
                </div>

                {verifyResult.record && (
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">User:</span>
                      <Address address={verifyResult.record.userAddress} chars={6} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">Protocol:</span>
                      <span className="text-text-primary">{verifyResult.record.protocolId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">Cost:</span>
                      <span className="text-text-primary">
                        {formatUSD(verifyResult.record.estimatedCostUSD)}
                      </span>
                    </div>
                  </div>
                )}

                {verifyResult.onChainEvent?.transactionHash && (
                  <TxLink txHash={verifyResult.onChainEvent.transactionHash} testnet />
                )}

                {verifyResult.error && (
                  <p className="text-sm text-error">{verifyResult.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={5} />
            ) : activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Sponsorship records will appear here once transactions are processed."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Decision Hash</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <CopyableHash hash={record.decisionHash} />
                        </TableCell>
                        <TableCell>
                          <Address address={record.userAddress} chars={4} />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/protocols/${record.protocolId}`}
                            className="text-cyan-400 hover:underline"
                          >
                            {record.protocolId}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatUSD(record.estimatedCostUSD)}
                        </TableCell>
                        <TableCell>
                          {record.txHash ? (
                            <Badge variant="success">Confirmed</Badge>
                          ) : (
                            <Badge variant="warning">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-text-muted text-sm">
                          {new Date(record.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
  loading?: boolean;
  color: 'cyan' | 'coral' | 'success' | 'warning' | 'default';
}) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    coral: 'bg-coral-500/10 text-coral-400',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    default: 'bg-elevated text-text-primary',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-sm text-text-muted">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="font-display text-xl sm:text-2xl font-bold text-text-primary">
            {value ?? '-'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerifyBadge({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${passed ? 'bg-success' : 'bg-error'}`} />
      <span className="text-sm text-text-secondary">{label}:</span>
      <span className={`text-sm font-medium ${passed ? 'text-success' : 'text-error'}`}>
        {passed ? 'Valid' : 'Invalid'}
      </span>
    </div>
  );
}

function CopyableHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(hash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs text-text-secondary">
        {hash.slice(0, 10)}...{hash.slice(-4)}
      </code>
      <button
        onClick={handleCopy}
        className="text-text-muted hover:text-cyan-400 transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
