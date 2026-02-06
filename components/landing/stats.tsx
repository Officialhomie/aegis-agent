'use client';

import { useEffect, useState } from 'react';
import { Activity, Users, Shield, TrendingUp } from 'lucide-react';

interface StatsData {
  sponsorshipsToday: number;
  activeProtocols: number;
  reserveHealth: {
    ETH: number;
    USDC: number;
    healthy: boolean;
  };
}

export function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Silently fail, show defaults
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const statItems = [
    {
      icon: Activity,
      label: 'Sponsorships Today',
      value: stats?.sponsorshipsToday ?? 0,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
    {
      icon: Users,
      label: 'Active Protocols',
      value: stats?.activeProtocols ?? 0,
      color: 'text-coral-400',
      bgColor: 'bg-coral-500/10',
    },
    {
      icon: Shield,
      label: 'Reserve Health',
      value: stats?.reserveHealth?.healthy ? 'Healthy' : 'Low',
      color: stats?.reserveHealth?.healthy ? 'text-success' : 'text-warning',
      bgColor: stats?.reserveHealth?.healthy ? 'bg-success/10' : 'bg-warning/10',
    },
    {
      icon: TrendingUp,
      label: 'ETH Reserves',
      value: `${(stats?.reserveHealth?.ETH ?? 0).toFixed(4)} ETH`,
      color: 'text-text-primary',
      bgColor: 'bg-elevated',
    },
  ];

  return (
    <section className="py-24 px-6 bg-surface/50">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mb-4">
            Live Statistics
          </h2>
          <p className="text-lg text-text-secondary">
            Real-time metrics from the Aegis paymaster
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {statItems.map((stat) => (
            <div key={stat.label} className="card-agentic p-6 text-center">
              <div
                className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${stat.bgColor} mb-4`}
              >
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="font-display text-2xl md:text-3xl font-bold text-text-primary mb-1">
                {loading ? (
                  <div className="h-8 w-16 mx-auto skeleton rounded" />
                ) : (
                  stat.value
                )}
              </div>
              <div className="text-sm text-text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
