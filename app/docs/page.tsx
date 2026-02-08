import Link from 'next/link';
import {
  Rocket,
  Building2,
  Bot,
  Code,
  Cog,
  Shield,
  HelpCircle,
  ArrowRight,
  Zap,
  Lock,
  Globe,
} from 'lucide-react';

const sections = [
  {
    title: 'Getting Started',
    description: '5-minute quickstart guide for protocols and AI agents',
    href: '/docs/getting-started',
    icon: Rocket,
    color: 'cyan',
  },
  {
    title: 'For Protocols',
    description: 'Register, whitelist contracts, and manage sponsorship budgets',
    href: '/docs/protocols',
    icon: Building2,
    color: 'coral',
  },
  {
    title: 'For AI Agents',
    description: 'Eligibility criteria, automatic sponsorship, and reputation',
    href: '/docs/agents',
    icon: Bot,
    color: 'cyan',
  },
  {
    title: 'API Reference',
    description: 'Complete REST API documentation with examples',
    href: '/docs/api',
    icon: Code,
    color: 'coral',
  },
  {
    title: 'Architecture',
    description: 'ORAE loop, decision flow, and on-chain components',
    href: '/docs/architecture',
    icon: Cog,
    color: 'cyan',
  },
  {
    title: 'Transparency',
    description: 'On-chain verification, Farcaster posts, and social proofs',
    href: '/docs/transparency',
    icon: Shield,
    color: 'coral',
  },
];

const highlights = [
  {
    icon: Zap,
    title: 'Zero Friction',
    description: 'Users never need ETH for gas. Aegis sponsors automatically.',
  },
  {
    icon: Lock,
    title: 'Secure by Design',
    description: '10 policy rules, on-chain logging, and cryptographic signatures.',
  },
  {
    icon: Globe,
    title: 'Fully Transparent',
    description: 'Every decision logged on-chain and posted to Farcaster.',
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm text-cyan-400">Documentation</span>
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold text-text-primary">
          Aegis Documentation
        </h1>

        <p className="text-xl text-text-secondary max-w-2xl">
          Everything you need to integrate with the autonomous gas sponsorship agent.
          Aegis sponsors gas fees for AI agents on Base, funded by protocols via the x402 payment protocol.
        </p>
      </div>

      {/* Quick highlights */}
      <div className="grid md:grid-cols-3 gap-6">
        {highlights.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border"
          >
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <item.icon className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">{item.title}</h3>
              <p className="text-sm text-text-muted mt-1">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Section cards */}
      <div>
        <h2 className="font-display text-2xl font-bold text-text-primary mb-6">
          Explore the Docs
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group p-6 rounded-lg bg-surface border border-border hover:border-cyan-500/50 hover:shadow-glow-cyan/20 transition-all"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`p-3 rounded-lg ${
                    section.color === 'cyan'
                      ? 'bg-cyan-500/10'
                      : 'bg-coral-500/10'
                  }`}
                >
                  <section.icon
                    className={`h-6 w-6 ${
                      section.color === 'cyan' ? 'text-cyan-400' : 'text-coral-400'
                    }`}
                  />
                </div>
                <ArrowRight className="h-5 w-5 text-text-muted group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </div>

              <h3 className="font-display text-lg font-semibold text-text-primary mt-4">
                {section.title}
              </h3>
              <p className="text-sm text-text-secondary mt-2">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ link */}
      <div className="p-6 rounded-lg bg-elevated border border-border">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-warning/10">
            <HelpCircle className="h-6 w-6 text-warning" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text-primary">Have Questions?</h3>
            <p className="text-sm text-text-muted mt-1">
              Check our FAQ for common questions about Aegis, eligibility, and integration.
            </p>
          </div>
          <Link
            href="/docs/faq"
            className="px-4 py-2 rounded-lg bg-surface border border-border text-text-primary hover:border-cyan-500/50 transition-colors"
          >
            View FAQ
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="border-t border-border pt-8">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          Quick Links
        </h3>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/dashboard"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            Dashboard
          </Link>
          <Link
            href="/protocols/register"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            Register Protocol
          </Link>
          <a
            href="https://github.com/aegis-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            GitHub
          </a>
          <a
            href="https://warpcast.com/aegis"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            Farcaster
          </a>
          <a
            href="https://www.moltbook.com/agents/aegis"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
          >
            Moltbook
          </a>
        </div>
      </div>
    </div>
  );
}
