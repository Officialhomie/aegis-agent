'use client';

import { useState, useCallback, useEffect } from 'react';

interface Stats {
  sponsorshipsToday: number;
  activeProtocols: number;
  reserveHealth: { ETH: number; USDC: number; healthy: boolean };
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
    estimatedCostUSD: bigint;
    timestamp: bigint;
    transactionHash: string;
  };
  error?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [verifyHash, setVerifyHash] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      if (res.ok) setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/activity?limit=30');
      const data = await res.json();
      if (res.ok) setActivity(data.activity ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchActivity();
  }, [fetchStats, fetchActivity]);

  const handleVerify = useCallback(async () => {
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
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyHash]);

  const explorerTxUrl = (txHash: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASESCAN_URL ?? 'https://sepolia.basescan.org';
    return `${baseUrl}/tx/${txHash}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Aegis Base Paymaster — Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Real-time stats, recent activity, and decision verification
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Real-time stats</h2>
          {loading && !stats ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : stats ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Sponsorships today</p>
                <p className="text-2xl font-semibold">{stats.sponsorshipsToday}</p>
              </div>
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Active protocols</p>
                <p className="text-2xl font-semibold">{stats.activeProtocols}</p>
              </div>
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Reserve health</p>
                <p className="text-2xl font-semibold">
                  {stats.reserveHealth.healthy ? 'OK' : 'Low'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  ETH: {stats.reserveHealth.ETH.toFixed(4)} · USDC: {stats.reserveHealth.USDC}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No stats available.</p>
          )}
          <button
            type="button"
            onClick={() => { fetchStats(); fetchActivity(); }}
            disabled={loading}
            className="mt-4 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-sm font-medium disabled:opacity-50"
          >
            Refresh
          </button>
        </section>

        {/* Verification */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Verify decision</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Enter a decision hash to verify on-chain and signature.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="0x… decision hash"
              value={verifyHash}
              onChange={(e) => setVerifyHash(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifyLoading || !verifyHash.trim()}
              className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50"
            >
              {verifyLoading ? 'Verifying…' : 'Verify'}
            </button>
          </div>
          {verifyResult && (
            <div className="mt-4 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm space-y-2">
              <p>
                On-chain: <strong>{verifyResult.onChain ? 'Yes' : 'No'}</strong>
              </p>
              <p>
                Signature valid: <strong>{verifyResult.signatureValid ? 'Yes' : 'No'}</strong>
              </p>
              {verifyResult.record && (
                <p>
                  User: <span className="font-mono">{verifyResult.record.userAddress}</span> · Protocol: {verifyResult.record.protocolId} · ${verifyResult.record.estimatedCostUSD}
                </p>
              )}
              {verifyResult.onChainEvent?.transactionHash && (
                <a
                  href={explorerTxUrl(verifyResult.onChainEvent.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  View transaction on Basescan
                </a>
              )}
              {verifyResult.error && (
                <p className="text-red-600 dark:text-red-400">{verifyResult.error}</p>
              )}
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Recent activity</h2>
          {activity.length === 0 && !loading ? (
            <p className="text-sm text-zinc-500">No sponsorship records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
                    <th className="py-2 pr-2">Decision hash</th>
                    <th className="py-2 pr-2">User</th>
                    <th className="py-2 pr-2">Protocol</th>
                    <th className="py-2 pr-2">Est. cost</th>
                    <th className="py-2 pr-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 pr-2 font-mono text-xs break-all max-w-[120px]">
                        {r.decisionHash.slice(0, 10)}…
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs max-w-[100px] truncate">
                        {r.userAddress.slice(0, 8)}…
                      </td>
                      <td className="py-2 pr-2">{r.protocolId}</td>
                      <td className="py-2 pr-2">${r.estimatedCostUSD}</td>
                      <td className="py-2 pr-2 text-zinc-500">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
