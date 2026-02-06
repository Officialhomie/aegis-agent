import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const benefits = [
  'Zero-friction UX for your users',
  'Only pay for successful transactions',
  'Whitelist specific contracts',
  'Real-time spending dashboard',
  'Automatic budget management',
  'On-chain transparency',
];

export function ForProtocols() {
  return (
    <section id="for-protocols" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left: Content */}
          <div>
            <span className="text-coral-400 font-medium text-sm uppercase tracking-wider">
              For Protocols
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mt-2 mb-6">
              Sponsor Gas for Your Users
            </h2>
            <p className="text-lg text-text-secondary mb-8">
              Remove the biggest barrier to onchain adoption. With Aegis, your users never need
              to hold ETH for gas. You deposit USDC, we handle the sponsorships.
            </p>

            {/* Benefits list */}
            <ul className="space-y-3 mb-8">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-cyan-400" />
                  </div>
                  <span className="text-text-secondary">{benefit}</span>
                </li>
              ))}
            </ul>

            <Link href="/protocols/register">
              <Button size="lg" className="group">
                Register Your Protocol
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          {/* Right: Visual */}
          <div className="relative">
            <div className="card-agentic p-8">
              {/* Mock protocol registration preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-coral-500/20 flex items-center justify-center">
                    <span className="font-display font-bold text-coral-400">P</span>
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">Your Protocol</div>
                    <div className="text-sm text-text-muted">Gold Tier</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-elevated rounded-lg p-4">
                    <div className="text-sm text-text-muted mb-1">Balance</div>
                    <div className="font-display text-xl font-bold text-text-primary">$1,000</div>
                  </div>
                  <div className="bg-elevated rounded-lg p-4">
                    <div className="text-sm text-text-muted mb-1">Sponsorships</div>
                    <div className="font-display text-xl font-bold text-cyan-400">247</div>
                  </div>
                </div>

                <div className="bg-elevated rounded-lg p-4">
                  <div className="text-sm text-text-muted mb-2">Whitelisted Contracts</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <code className="text-xs text-text-secondary">0x1234...5678</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <code className="text-xs text-text-secondary">0xabcd...efgh</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-coral-500/10 to-cyan-500/10 rounded-2xl blur-2xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
