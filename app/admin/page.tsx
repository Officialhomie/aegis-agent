'use client';

import { useState, useCallback } from 'react';

type ExecutionMode = 'LIVE' | 'SIMULATION' | 'READONLY';

interface AgentStatus {
  mode: string;
  hasOpenAI: boolean;
  hasTreasury: boolean;
  timestamp: string;
}

interface CycleResult {
  ok: boolean;
  state?: {
    observationsCount: number;
    currentDecision: unknown;
    hasExecutionResult: boolean;
  };
}

export default function Home() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [cycleResult, setCycleResult] = useState<CycleResult | null>(null);
  const [config, setConfig] = useState({
    confidenceThreshold: 0.75,
    maxTransactionValueUsd: 10000,
    executionMode: 'SIMULATION' as ExecutionMode,
  });

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/status');
      const data = await res.json();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const runCycle = useCallback(async () => {
    setLoading(true);
    setCycleResult(null);
    try {
      const res = await fetch('/api/agent/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setCycleResult(data);
      if (data.ok) await fetchStatus();
    } finally {
      setLoading(false);
    }
  }, [config, fetchStatus]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Aegis Agent Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Treasury management agent – observe, reason, decide, act
          </p>
        </div>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-sm font-medium"
        >
          Paymaster dashboard (stats, activity, verify)
        </a>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Status */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Agent Status</h2>
          {status ? (
            <ul className="space-y-2 text-sm">
              <li>Mode: <span className="font-mono">{status.mode}</span></li>
              <li>OpenAI: {status.hasOpenAI ? 'Configured' : 'Not set'}</li>
              <li>Treasury: {status.hasTreasury ? 'Configured' : 'Not set'}</li>
              <li>Last check: {new Date(status.timestamp).toLocaleString()}</li>
            </ul>
          ) : (
            <p className="text-zinc-500 text-sm">Load status to see configuration.</p>
          )}
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="mt-4 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh status'}
          </button>
        </section>

        {/* Configuration */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Configuration</h2>
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Confidence threshold
              </label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.confidenceThreshold}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, confidenceThreshold: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Max transaction value (USD)
              </label>
              <input
                type="number"
                min={0}
                value={config.maxTransactionValueUsd}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, maxTransactionValueUsd: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Execution mode
              </label>
              <select
                value={config.executionMode}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, executionMode: e.target.value as ExecutionMode }))
                }
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
              >
                <option value="SIMULATION">SIMULATION</option>
                <option value="READONLY">READONLY</option>
                <option value="LIVE">LIVE</option>
              </select>
            </div>
          </div>
        </section>

        {/* Manual override */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-medium mb-4">Run cycle</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Trigger a single observe–reason–decide–act–memory cycle with the current config.
          </p>
          <button
            type="button"
            onClick={runCycle}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Run cycle'}
          </button>
          {cycleResult && (
            <div className="mt-4 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm font-mono">
              {cycleResult.ok ? (
                <pre className="whitespace-pre-wrap">
                  {cycleResult.state != null ? JSON.stringify(cycleResult.state, null, 2) : ''}
                </pre>
              ) : (
                <p className="text-red-600 dark:text-red-400">{String((cycleResult as { error?: string }).error)}</p>
              )}
            </div>
          )}
        </section>

        {/* Decision / result placeholder */}
        {cycleResult?.state?.currentDecision != null && (
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <h2 className="text-lg font-medium mb-4">Last decision</h2>
            <pre className="text-sm font-mono whitespace-pre-wrap break-all p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-x-auto">
              {JSON.stringify(cycleResult.state!.currentDecision, null, 2)}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
