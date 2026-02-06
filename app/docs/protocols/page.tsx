import Link from 'next/link';
import { Building2, Wallet, FileText, Bell, BarChart3, Shield } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';

export default function ProtocolsDocsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-coral-500/10">
            <Building2 className="h-6 w-6 text-coral-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            For Protocols
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Register your protocol with Aegis to sponsor gas fees for your users.
          No code changes required - just register, whitelist contracts, and deposit funds.
        </p>
      </div>

      {/* Registration */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Registration
        </h2>

        <p className="text-text-secondary">
          Register your protocol via the API or the{' '}
          <Link href="/protocols/register" className="text-cyan-400 hover:underline">
            registration form
          </Link>
          .
        </p>

        <div className="space-y-4">
          <h3 className="font-semibold text-text-primary">Required Fields</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Field</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Type</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-text-secondary">
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3 font-mono text-coral-400">protocolId</td>
                  <td className="py-2 px-3 font-mono text-cyan-400">string</td>
                  <td className="py-2 px-3">Unique identifier (a-z, 0-9, -, _)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3 font-mono text-coral-400">name</td>
                  <td className="py-2 px-3 font-mono text-cyan-400">string</td>
                  <td className="py-2 px-3">Display name for your protocol</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3 font-mono text-coral-400">tier</td>
                  <td className="py-2 px-3 font-mono text-cyan-400">enum</td>
                  <td className="py-2 px-3">bronze, silver, or gold</td>
                </tr>
              </tbody>
            </table>
          </div>

          <CodeBlock
            language="bash"
            code={`curl -X POST https://clawgas.vercel.app/api/protocol/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "protocolId": "my-defi-app",
    "name": "My DeFi App",
    "tier": "silver",
    "whitelistedContracts": ["0x1234...5678"],
    "initialBalanceUSD": 100
  }'`}
          />
        </div>
      </section>

      {/* Tier System */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Tier System
        </h2>

        <p className="text-text-secondary">
          Choose a tier based on your expected sponsorship volume and feature needs.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Bronze */}
          <div className="p-6 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-orange-600" />
              <h3 className="font-display text-lg font-bold text-text-primary">Bronze</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>100 sponsorships/day</li>
              <li>Standard priority</li>
              <li>Basic dashboard</li>
              <li>Email support</li>
            </ul>
            <p className="mt-4 text-text-muted text-sm">Best for: Testing and small apps</p>
          </div>

          {/* Silver */}
          <div className="p-6 rounded-lg bg-surface border border-cyan-500/30 relative">
            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-cyan-500 text-white text-xs font-bold rounded">
              POPULAR
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <h3 className="font-display text-lg font-bold text-text-primary">Silver</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>500 sponsorships/day</li>
              <li>High priority queue</li>
              <li>Budget alerts</li>
              <li>Priority support</li>
            </ul>
            <p className="mt-4 text-text-muted text-sm">Best for: Growing protocols</p>
          </div>

          {/* Gold */}
          <div className="p-6 rounded-lg bg-surface border border-warning/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <h3 className="font-display text-lg font-bold text-text-primary">Gold</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>Unlimited sponsorships</li>
              <li>Highest priority</li>
              <li>Custom rules</li>
              <li>Dedicated support</li>
            </ul>
            <p className="mt-4 text-text-muted text-sm">Best for: High-volume protocols</p>
          </div>
        </div>
      </section>

      {/* Contract Whitelisting */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Contract Whitelisting
        </h2>

        <Callout variant="warning" title="Security First">
          Only whitelisted contracts can receive sponsored gas. This prevents abuse and
          ensures sponsorships go to legitimate protocol interactions.
        </Callout>

        <p className="text-text-secondary">
          Add contract addresses during registration or update them later:
        </p>

        <CodeBlock
          language="bash"
          code={`curl -X PATCH https://clawgas.vercel.app/api/protocol/my-defi-app \\
  -H "Content-Type: application/json" \\
  -d '{
    "whitelistedContracts": [
      "0x1234567890abcdef1234567890abcdef12345678",
      "0xabcdef1234567890abcdef1234567890abcdef12"
    ]
  }'`}
        />

        <Callout variant="tip">
          You can whitelist multiple contracts. Common use cases include main protocol
          contracts, router contracts, and helper contracts.
        </Callout>
      </section>

      {/* Budget Management */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Budget Management
        </h2>

        <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
          <Wallet className="h-6 w-6 text-coral-400 shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-text-primary">Cost Per Sponsorship</h3>
            <p className="text-text-secondary mt-1">
              Each sponsored transaction costs approximately <strong className="text-coral-400">$0.50 USD</strong>.
              This covers gas fees and a small protocol fee.
            </p>
          </div>
        </div>

        <h3 className="font-semibold text-text-primary mt-6">Top Up Your Balance</h3>
        <p className="text-text-secondary">
          Add funds to your sponsorship budget via the API or dashboard:
        </p>

        <CodeBlock
          language="bash"
          code={`curl -X POST https://clawgas.vercel.app/api/protocol/my-defi-app/topup \\
  -H "Content-Type: application/json" \\
  -d '{
    "amountUSD": 500,
    "reference": "invoice-123"
  }'`}
        />

        <Callout variant="info" title="x402 Payment Protocol">
          For automated top-ups, integrate with the x402 payment protocol. Contact us for
          webhook configuration.
        </Callout>
      </section>

      {/* Webhook Integration */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Webhook Integration
        </h2>

        <p className="text-text-secondary">
          Receive real-time notifications when sponsorships occur or your budget runs low.
        </p>

        <div className="space-y-4">
          <h3 className="font-semibold text-text-primary">Payment Webhook</h3>
          <p className="text-text-secondary">
            The <code className="px-1 py-0.5 bg-elevated rounded text-coral-400">/api/protocol/webhook</code> endpoint
            receives x402 payment confirmations:
          </p>

          <CodeBlock
            language="json"
            code={`{
  "protocolId": "my-defi-app",
  "amountUSD": 100,
  "paymentId": "pay_abc123",
  "timestamp": "2024-01-15T12:00:00Z"
}`}
          />

          <Callout variant="warning" title="Signature Verification">
            All webhook requests include an HMAC-SHA256 signature in the{' '}
            <code className="text-coral-400">x-aegis-signature</code> header. Always verify
            signatures before processing.
          </Callout>
        </div>
      </section>

      {/* Monitoring */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Monitoring & Analytics
        </h2>

        <p className="text-text-secondary">
          Track your protocol's sponsorship activity via the{' '}
          <Link href="/dashboard" className="text-cyan-400 hover:underline">
            dashboard
          </Link>{' '}
          or API.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary">Dashboard Metrics</h3>
            </div>
            <ul className="text-sm text-text-muted space-y-1">
              <li>Total sponsorships</li>
              <li>Cost breakdown</li>
              <li>Unique users sponsored</li>
              <li>Budget remaining</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-coral-400" />
              <h3 className="font-semibold text-text-primary">Activity Log</h3>
            </div>
            <ul className="text-sm text-text-muted space-y-1">
              <li>Transaction history</li>
              <li>Decision hashes</li>
              <li>On-chain verification</li>
              <li>Export to CSV</li>
            </ul>
          </div>
        </div>

        <h3 className="font-semibold text-text-primary mt-6">API Access</h3>
        <CodeBlock
          language="bash"
          code={`# Get protocol details
curl https://clawgas.vercel.app/api/protocol/my-defi-app

# Response
{
  "protocolId": "my-defi-app",
  "name": "My DeFi App",
  "tier": "silver",
  "balanceUSD": 450.00,
  "totalSpent": 50.00,
  "sponsorshipCount": 100,
  "whitelistedContracts": ["0x1234..."],
  "createdAt": "2024-01-01T00:00:00Z"
}`}
        />
      </section>

      {/* Next steps */}
      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="font-display text-xl font-bold text-text-primary">
          Next Steps
        </h2>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/protocols/register"
            className="px-4 py-2 bg-coral-500 text-white rounded-lg hover:bg-coral-600 transition-colors"
          >
            Register Your Protocol
          </Link>
          <Link
            href="/docs/api"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            View API Reference
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            Open Dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
