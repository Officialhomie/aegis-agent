'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Clock,
  DollarSign,
  Activity,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
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
import { EmptyState } from '@/components/common/empty-state';
import { Address } from '@/components/common/address';
import { TxLink } from '@/components/common/tx-link';
import { formatUSD } from '@/lib/utils';

interface GuaranteeDetails {
  id: string;
  type: 'GAS_BUDGET' | 'TX_COUNT' | 'TIME_WINDOW';
  beneficiary: string;
  protocolId: string;
  status: 'PENDING' | 'ACTIVE' | 'DEPLETED' | 'EXPIRED' | 'BREACHED' | 'CANCELLED';
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  budget: {
    total: number;
    used: number;
    remaining: number;
    utilizationPct: number;
  };
  sla: {
    totalExecutions: number;
    slaMet: number;
    slaBreached: number;
    complianceRate: number;
  };
  financial: {
    lockedAmount: number;
    premiumPaid: number;
    refundsIssued: number;
    netCost: number;
  };
  validity: {
    from: string;
    until: string;
    remainingDays: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface UsageRecord {
  id: string;
  userOpHash: string;
  txHash: string | null;
  gasUsed: string;
  gasPriceWei: string;
  costWei: string;
  costUsd: number;
  submittedAt: string;
  includedAt: string | null;
  latencyMs: number | null;
  slaMet: boolean | null;
}

interface UsageSummary {
  totalRecords: number;
  totalCostUsd: number;
  avgLatencyMs: number | null;
  slaMetCount: number;
  slaBreachedCount: number;
  complianceRate: number;
}

export default function GuaranteeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const guaranteeId = params.id as string;

  const [guarantee, setGuarantee] = useState<GuaranteeDetails | null>(null);
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchGuarantee = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/guarantees/${guaranteeId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setGuarantee(data.guarantee);
      }
    } catch {
      // Silently fail
    }
  }, [guaranteeId]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/guarantees/${guaranteeId}/usage?limit=20`);
      const data = await res.json();
      if (res.ok && data.success) {
        setUsage(data.usage ?? []);
        setUsageSummary(data.summary ?? null);
      }
    } catch {
      // Silently fail
    }
  }, [guaranteeId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchGuarantee(), fetchUsage()]);
      setLoading(false);
    };
    loadData();
  }, [fetchGuarantee, fetchUsage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchGuarantee(), fetchUsage()]);
    setRefreshing(false);
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this guarantee? Unused budget will be refunded minus a cancellation fee.')) {
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch(`/api/v1/guarantees/${guaranteeId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/dashboard/guarantees');
      }
    } catch {
      // Silently fail
    } finally {
      setCancelling(false);
    }
  };

  const tierColors = {
    BRONZE: 'bg-amber-900/30 text-amber-400 border-amber-700',
    SILVER: 'bg-slate-400/20 text-slate-300 border-slate-500',
    GOLD: 'bg-yellow-500/20 text-yellow-400 border-yellow-600',
  };

  const statusColors = {
    PENDING: 'warning',
    ACTIVE: 'success',
    DEPLETED: 'default',
    EXPIRED: 'default',
    BREACHED: 'error',
    CANCELLED: 'default',
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
              <Link href="/dashboard" className="hover:text-cyan-400">
                Dashboard
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/dashboard/guarantees" className="hover:text-cyan-400">
                Guarantees
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-text-primary">Details</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/guarantees">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="font-display text-3xl font-bold text-text-primary">
                Guarantee Details
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {guarantee?.status === 'ACTIVE' && (
              <Button variant="destructive" onClick={handleCancel} loading={cancelling}>
                <Trash2 className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !guarantee ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                title="Guarantee not found"
                description="The requested guarantee could not be found."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overview card */}
            <Card>
              <CardContent className="py-6">
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Left: Type and status */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`px-3 py-1 rounded-lg border ${tierColors[guarantee.tier]}`}>
                        <span className="font-bold">{guarantee.tier}</span>
                      </div>
                      <Badge variant={statusColors[guarantee.status]} className="text-sm">
                        {guarantee.status}
                      </Badge>
                    </div>

                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                      {guarantee.type.replace('_', ' ')} Guarantee
                    </h2>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted w-24">Beneficiary:</span>
                        <Address address={guarantee.beneficiary} chars={8} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted w-24">Protocol:</span>
                        <span className="text-text-primary">{guarantee.protocolId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted w-24">Created:</span>
                        <span className="text-text-secondary">
                          {new Date(guarantee.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted w-24">Valid until:</span>
                        <span className="text-text-secondary">
                          {new Date(guarantee.validity.until).toLocaleString()}
                          {guarantee.validity.remainingDays > 0 && (
                            <span className="text-text-muted ml-2">
                              ({guarantee.validity.remainingDays} days left)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Budget */}
                    <MetricCard
                      icon={DollarSign}
                      label="Budget"
                      value={formatUSD(guarantee.budget.total)}
                      subtext={`${guarantee.budget.utilizationPct.toFixed(1)}% used`}
                      color="cyan"
                    />
                    {/* SLA Compliance */}
                    <MetricCard
                      icon={CheckCircle}
                      label="SLA Compliance"
                      value={`${guarantee.sla.complianceRate.toFixed(1)}%`}
                      subtext={`${guarantee.sla.totalExecutions} executions`}
                      color={guarantee.sla.complianceRate >= 95 ? 'success' : 'warning'}
                    />
                    {/* Refunds */}
                    <MetricCard
                      icon={AlertTriangle}
                      label="Refunds Issued"
                      value={formatUSD(guarantee.financial.refundsIssued)}
                      subtext={`${guarantee.sla.slaBreached} breaches`}
                      color={guarantee.sla.slaBreached > 0 ? 'warning' : 'default'}
                    />
                    {/* Net Cost */}
                    <MetricCard
                      icon={Activity}
                      label="Net Cost"
                      value={formatUSD(guarantee.financial.netCost)}
                      subtext={`Premium: ${formatUSD(guarantee.financial.premiumPaid)}`}
                      color="coral"
                    />
                  </div>
                </div>

                {/* Usage bar */}
                <div className="mt-6 pt-6 border-t border-elevated-border">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-text-muted">Budget Utilization</span>
                    <span className="text-text-primary font-medium">
                      {formatUSD(guarantee.budget.used)} / {formatUSD(guarantee.budget.total)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        guarantee.budget.utilizationPct >= 90
                          ? 'bg-coral-500'
                          : guarantee.budget.utilizationPct >= 70
                          ? 'bg-warning'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, guarantee.budget.utilizationPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>Used: {formatUSD(guarantee.budget.used)}</span>
                    <span>Remaining: {formatUSD(guarantee.budget.remaining)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage history */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Usage History</span>
                  {usageSummary && (
                    <span className="text-sm font-normal text-text-muted">
                      {usageSummary.totalRecords} total transactions
                      {usageSummary.avgLatencyMs && (
                        <span className="ml-2">
                          | Avg latency: {Math.round(usageSummary.avgLatencyMs)}ms
                        </span>
                      )}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usage.length === 0 ? (
                  <EmptyState
                    title="No usage yet"
                    description="Transactions will appear here once the guarantee is used."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>UserOp Hash</TableHead>
                          <TableHead>Tx Hash</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Latency</TableHead>
                          <TableHead>SLA</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usage.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <code className="text-xs text-text-secondary">
                                {record.userOpHash.slice(0, 10)}...{record.userOpHash.slice(-4)}
                              </code>
                            </TableCell>
                            <TableCell>
                              {record.txHash ? (
                                <TxLink txHash={record.txHash} testnet chars={8} />
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatUSD(record.costUsd)}
                            </TableCell>
                            <TableCell className="text-right text-text-secondary">
                              {record.latencyMs ? `${record.latencyMs}ms` : '-'}
                            </TableCell>
                            <TableCell>
                              {record.slaMet === true ? (
                                <span className="flex items-center gap-1 text-success text-sm">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Met
                                </span>
                              ) : record.slaMet === false ? (
                                <span className="flex items-center gap-1 text-error text-sm">
                                  <XCircle className="h-3.5 w-3.5" />
                                  Breached
                                </span>
                              ) : (
                                <span className="text-text-muted text-sm">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-text-muted text-sm">
                              {new Date(record.submittedAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  color: 'cyan' | 'coral' | 'success' | 'warning' | 'default';
}) {
  const colorClasses = {
    cyan: 'text-cyan-400',
    coral: 'text-coral-400',
    success: 'text-success',
    warning: 'text-warning',
    default: 'text-text-primary',
  };

  return (
    <div className="bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${colorClasses[color]}`} />
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-xs text-text-muted mt-1">{subtext}</div>
    </div>
  );
}
