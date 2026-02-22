'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  Clock,
  DollarSign,
  Activity,
  Plus,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { Address } from '@/components/common/address';
import { formatUSD } from '@/lib/utils';

interface Guarantee {
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
}

interface GuaranteeStats {
  total: number;
  active: number;
  totalLocked: number;
  avgCompliance: number;
}

export default function GuaranteesPage() {
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [stats, setStats] = useState<GuaranteeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchGuarantees = useCallback(async () => {
    try {
      // In a real app, this would include the protocolId from auth context
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await fetch(`/api/v1/guarantees?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setGuarantees(data.guarantees ?? []);

        // Calculate stats
        const active = data.guarantees?.filter((g: Guarantee) => g.status === 'ACTIVE') ?? [];
        const totalLocked = data.guarantees?.reduce(
          (sum: number, g: Guarantee) => sum + g.financial.lockedAmount,
          0
        ) ?? 0;
        const avgCompliance =
          data.guarantees?.length > 0
            ? data.guarantees.reduce((sum: number, g: Guarantee) => sum + g.sla.complianceRate, 0) /
              data.guarantees.length
            : 100;

        setStats({
          total: data.guarantees?.length ?? 0,
          active: active.length,
          totalLocked,
          avgCompliance,
        });
      }
    } catch {
      // Silently fail
    }
  }, [statusFilter]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchGuarantees();
      setLoading(false);
    };
    loadData();
  }, [fetchGuarantees]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGuarantees();
    setRefreshing(false);
  };

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
              <span className="text-text-primary">Guarantees</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-text-primary">
              Execution Guarantees
            </h1>
            <p className="text-text-secondary mt-1">
              SLA-backed sponsorship with reserved capacity and automatic refunds
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button>
              <Plus className="h-4 w-4" />
              New Guarantee
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            icon={Shield}
            label="Total Guarantees"
            value={stats?.total}
            loading={loading}
            color="cyan"
          />
          <StatsCard
            icon={Activity}
            label="Active"
            value={stats?.active}
            loading={loading}
            color="success"
          />
          <StatsCard
            icon={DollarSign}
            label="Total Locked"
            value={stats ? formatUSD(stats.totalLocked) : undefined}
            loading={loading}
            color="coral"
          />
          <StatsCard
            icon={CheckCircle}
            label="Avg. Compliance"
            value={stats ? `${stats.avgCompliance.toFixed(1)}%` : undefined}
            loading={loading}
            color={stats && stats.avgCompliance >= 95 ? 'success' : 'warning'}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {['all', 'ACTIVE', 'PENDING', 'DEPLETED', 'EXPIRED', 'BREACHED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-elevated text-text-muted hover:text-text-primary'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Guarantees list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : guarantees.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                title="No guarantees found"
                description={
                  statusFilter === 'all'
                    ? 'Create your first execution guarantee to reserve capacity for your agents.'
                    : `No guarantees with status "${statusFilter.toLowerCase()}".`
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {guarantees.map((guarantee) => (
              <GuaranteeCard key={guarantee.id} guarantee={guarantee} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatsCard({
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
  color: 'cyan' | 'coral' | 'success' | 'warning';
}) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    coral: 'bg-coral-500/10 text-coral-400',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
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
          <div className="font-display text-2xl font-bold text-text-primary">{value ?? '-'}</div>
        )}
      </CardContent>
    </Card>
  );
}

function GuaranteeCard({ guarantee }: { guarantee: Guarantee }) {
  const tierColors = {
    BRONZE: 'bg-amber-900/30 text-amber-400',
    SILVER: 'bg-slate-400/20 text-slate-300',
    GOLD: 'bg-yellow-500/20 text-yellow-400',
  };

  const statusColors = {
    PENDING: 'warning',
    ACTIVE: 'success',
    DEPLETED: 'default',
    EXPIRED: 'default',
    BREACHED: 'error',
    CANCELLED: 'default',
  } as const;

  const typeIcons = {
    GAS_BUDGET: DollarSign,
    TX_COUNT: Activity,
    TIME_WINDOW: Clock,
  };

  const TypeIcon = typeIcons[guarantee.type];

  return (
    <Card className="hover:border-elevated-border transition-colors">
      <CardContent className="py-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Left: Type and beneficiary */}
          <div className="flex items-start gap-4 flex-1">
            <div className="p-3 rounded-lg bg-elevated">
              <TypeIcon className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-text-primary">
                  {guarantee.type.replace('_', ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierColors[guarantee.tier]}`}>
                  {guarantee.tier}
                </span>
                <Badge variant={statusColors[guarantee.status]}>
                  {guarantee.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span>Agent:</span>
                <Address address={guarantee.beneficiary} chars={6} />
              </div>
            </div>
          </div>

          {/* Center: Usage bar */}
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-muted">Usage</span>
              <span className="text-text-primary font-medium">
                {guarantee.budget.utilizationPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-elevated overflow-hidden">
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
              <span>{formatUSD(guarantee.budget.used)} used</span>
              <span>{formatUSD(guarantee.budget.remaining)} left</span>
            </div>
          </div>

          {/* Right: SLA and financial */}
          <div className="flex items-center gap-6">
            {/* SLA compliance */}
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center mb-1">
                {guarantee.sla.complianceRate >= 99 ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : guarantee.sla.complianceRate >= 95 ? (
                  <Zap className="h-4 w-4 text-warning" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-error" />
                )}
                <span
                  className={`font-bold ${
                    guarantee.sla.complianceRate >= 99
                      ? 'text-success'
                      : guarantee.sla.complianceRate >= 95
                      ? 'text-warning'
                      : 'text-error'
                  }`}
                >
                  {guarantee.sla.complianceRate.toFixed(1)}%
                </span>
              </div>
              <span className="text-xs text-text-muted">SLA</span>
            </div>

            {/* Financial summary */}
            <div className="text-right">
              <div className="font-medium text-text-primary">
                {formatUSD(guarantee.financial.netCost)}
              </div>
              <span className="text-xs text-text-muted">Net cost</span>
            </div>

            {/* Time remaining */}
            <div className="text-right">
              <div className="font-medium text-text-primary">
                {guarantee.validity.remainingDays}d
              </div>
              <span className="text-xs text-text-muted">Remaining</span>
            </div>

            {/* View button */}
            <Link href={`/dashboard/guarantees/${guarantee.id}`}>
              <Button variant="ghost" size="sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Breach warning */}
        {guarantee.sla.slaBreached > 0 && (
          <div className="mt-4 pt-4 border-t border-elevated-border">
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {guarantee.sla.slaBreached} SLA breach{guarantee.sla.slaBreached > 1 ? 'es' : ''} -{' '}
                {formatUSD(guarantee.financial.refundsIssued)} refunded
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
