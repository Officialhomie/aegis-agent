'use client';

import Link from 'next/link';
import { Shield, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-coral-500/5" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 229, 204, 0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(0, 229, 204, 0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border mb-8">
          <Zap className="h-4 w-4 text-cyan-400" />
          <span className="text-sm text-text-secondary">Autonomous Paymaster on Base</span>
        </div>

        {/* Main headline */}
        <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-tight">
          <span className="text-text-primary">Gasless Transactions</span>
          <br />
          <span className="gradient-text">for AI Agents</span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
          Aegis is an autonomous paymaster that sponsors gas fees for AI agents on Base.
          No gas, no friction, just action.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/protocols/register">
            <Button size="xl" className="group">
              Register Your Protocol
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary" size="xl">
              View Dashboard
            </Button>
          </Link>
        </div>

        {/* Stats preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <StatPreview label="Active Protocols" value="0" suffix="+" />
          <StatPreview label="Sponsorships Today" value="0" />
          <StatPreview label="Total Saved" value="$0" suffix=" in gas" />
        </div>
      </div>

      {/* Floating shield icon */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="animate-bounce">
          <Shield className="h-8 w-8 text-cyan-400/50" />
        </div>
      </div>
    </section>
  );
}

function StatPreview({ label, value, suffix = '' }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-bold text-text-primary">
        {value}
        <span className="text-cyan-400">{suffix}</span>
      </div>
      <div className="text-sm text-text-muted mt-1">{label}</div>
    </div>
  );
}
