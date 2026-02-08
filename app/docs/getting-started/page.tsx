import Link from 'next/link';
import { ArrowRight, Check, Zap, Building2, Bot, Wallet } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';

export default function GettingStartedPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold text-text-primary">
          Getting Started
        </h1>
        <p className="text-xl text-text-secondary">
          Get up and running with Aegis in 5 minutes. Learn how autonomous gas
          sponsorship works and integrate your protocol or agent.
        </p>
      </div>

      {/* What is Aegis */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          What is Aegis?
        </h2>

        <p className="text-text-secondary">
          Aegis is an <strong className="text-text-primary">autonomous AI agent</strong> that
          sponsors gas fees for other AI agents on Base. It operates 24/7 without human
          intervention, continuously monitoring the blockchain for eligible transactions.
        </p>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="p-2 rounded-lg bg-cyan-500/10 w-fit mb-3">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <h3 className="font-semibold text-text-primary">ERC-4337 Paymaster</h3>
            <p className="text-sm text-text-muted mt-1">
              Uses account abstraction to sponsor UserOperations without requiring ETH.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="p-2 rounded-lg bg-coral-500/10 w-fit mb-3">
              <Building2 className="h-5 w-5 text-coral-400" />
            </div>
            <h3 className="font-semibold text-text-primary">Protocol-Funded</h3>
            <p className="text-sm text-text-muted mt-1">
              Protocols deposit USDC to fund sponsorships. Users pay nothing.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="p-2 rounded-lg bg-success/10 w-fit mb-3">
              <Bot className="h-5 w-5 text-success" />
            </div>
            <h3 className="font-semibold text-text-primary">Fully Autonomous</h3>
            <p className="text-sm text-text-muted mt-1">
              ORAE loop: Observe, Reason, Approve, Execute. No human required.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          How It Works
        </h2>

        <div className="p-6 rounded-lg bg-surface border border-border">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-coral-500/20 flex items-center justify-center text-coral-400 font-bold">
                1
              </div>
              <div>
                <h4 className="font-semibold text-text-primary">Protocol Deposits</h4>
                <p className="text-sm text-text-muted">Fund sponsorship budget</p>
              </div>
            </div>

            <ArrowRight className="h-5 w-5 text-text-muted hidden md:block" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
                2
              </div>
              <div>
                <h4 className="font-semibold text-text-primary">Aegis Observes</h4>
                <p className="text-sm text-text-muted">Monitors low-gas wallets</p>
              </div>
            </div>

            <ArrowRight className="h-5 w-5 text-text-muted hidden md:block" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center text-warning font-bold">
                3
              </div>
              <div>
                <h4 className="font-semibold text-text-primary">Eligibility Check</h4>
                <p className="text-sm text-text-muted">Validates agent legitimacy</p>
              </div>
            </div>

            <ArrowRight className="h-5 w-5 text-text-muted hidden md:block" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success font-bold">
                4
              </div>
              <div>
                <h4 className="font-semibold text-text-primary">Gas Sponsored</h4>
                <p className="text-sm text-text-muted">Transaction executed</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quickstart for Protocols */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Quickstart for Protocols
        </h2>

        <Callout variant="info" title="Time to integrate">
          Most protocols can integrate Aegis in under 5 minutes. No code changes required
          to your contracts.
        </Callout>

        <div className="space-y-6 mt-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center text-white font-bold shrink-0">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Register Your Protocol</h3>
              <p className="text-text-secondary mb-4">
                Create a protocol account via the API or dashboard.
              </p>
              <CodeBlock
                language="bash"
                code={`curl -X POST https://clawgas.vercel.app/api/protocol/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "protocolId": "my-protocol",
    "name": "My Protocol",
    "tier": "bronze"
  }'`}
              />
              <p className="text-sm text-text-muted mt-2">
                Or use the{' '}
                <Link href="/protocols/register" className="text-cyan-400 hover:underline">
                  registration form
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center text-white font-bold shrink-0">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Whitelist Your Contracts</h3>
              <p className="text-text-secondary mb-4">
                Add the contract addresses you want sponsored.
              </p>
              <CodeBlock
                language="bash"
                code={`curl -X PATCH https://clawgas.vercel.app/api/protocol/my-protocol \\
  -H "Content-Type: application/json" \\
  -d '{
    "whitelistedContracts": [
      "0x1234...5678",
      "0xabcd...efgh"
    ]
  }'`}
              />
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center text-white font-bold shrink-0">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Deposit USDC Budget</h3>
              <p className="text-text-secondary mb-4">
                Send USDC on-chain to the protocol deposit address, then verify the deposit
                with the transaction hash and chain ID. Each sponsorship costs ~$0.50.
              </p>
              <CodeBlock
                language="bash"
                code={`curl -X POST https://clawgas.vercel.app/api/protocol/my-protocol/topup \\
  -H "Content-Type: application/json" \\
  -d '{
    "txHash": "0x...",
    "chainId": 8453
  }'`}
              />
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center text-white font-bold shrink-0">
              4
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Users Interact</h3>
              <p className="text-text-secondary">
                When eligible agents interact with your whitelisted contracts, Aegis
                automatically detects and sponsors their gas fees. No action required from you.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center text-white font-bold shrink-0">
              5
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Monitor via Dashboard</h3>
              <p className="text-text-secondary">
                Track sponsorships, costs, and budget in real-time on the{' '}
                <Link href="/dashboard" className="text-cyan-400 hover:underline">
                  dashboard
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quickstart for Agents */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Quickstart for AI Agents
        </h2>

        <Callout variant="tip" title="No setup required">
          AI agents don't need to register with Aegis. If you're eligible, sponsorship
          happens automatically.
        </Callout>

        <div className="space-y-6 mt-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white font-bold shrink-0">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Build Transaction History</h3>
              <p className="text-text-secondary">
                Aegis requires agents to have at least 5 previous transactions. This proves
                legitimacy and prevents Sybil attacks.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white font-bold shrink-0">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">
                Interact with Registered Protocols
              </h3>
              <p className="text-text-secondary">
                When your agent calls a whitelisted contract from a registered protocol,
                Aegis will detect the transaction and check eligibility.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white font-bold shrink-0">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary mb-2">Gas is Sponsored</h3>
              <p className="text-text-secondary">
                If eligible, Aegis sponsors the gas fee via the Base Paymaster. Your
                transaction executes without needing ETH in your wallet.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-lg bg-surface border border-border">
          <h4 className="font-semibold text-text-primary mb-3">Eligibility Checklist</h4>
          <ul className="space-y-2">
            {[
              { label: 'Transaction history (5+ txs)', desc: 'Proves legitimacy' },
              { label: 'No abuse flags', desc: 'Clean record required' },
              { label: 'Low gas balance (< 0.0001 ETH)', desc: 'Must need sponsorship' },
              { label: 'Whitelisted contract', desc: 'Protocol must register contract' },
              { label: 'Protocol has budget', desc: 'Sufficient USD balance' },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div>
                  <span className="text-text-primary">{item.label}</span>
                  <span className="text-text-muted"> - {item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Next steps */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Next Steps
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href="/docs/protocols"
            className="p-4 rounded-lg bg-surface border border-border hover:border-coral-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="h-5 w-5 text-coral-400" />
              <h3 className="font-semibold text-text-primary group-hover:text-coral-400">
                Protocol Integration Guide
              </h3>
            </div>
            <p className="text-sm text-text-muted">
              Deep dive into tiers, budgets, webhooks, and analytics.
            </p>
          </Link>

          <Link
            href="/docs/agents"
            className="p-4 rounded-lg bg-surface border border-border hover:border-cyan-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Bot className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary group-hover:text-cyan-400">
                Agent Eligibility & Reputation
              </h3>
            </div>
            <p className="text-sm text-text-muted">
              Learn about ERC-8004 attestations and Moltbook integration.
            </p>
          </Link>

          <Link
            href="/docs/api"
            className="p-4 rounded-lg bg-surface border border-border hover:border-coral-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="h-5 w-5 text-coral-400" />
              <h3 className="font-semibold text-text-primary group-hover:text-coral-400">
                API Reference
              </h3>
            </div>
            <p className="text-sm text-text-muted">
              Complete API documentation with request/response examples.
            </p>
          </Link>

          <Link
            href="/docs/architecture"
            className="p-4 rounded-lg bg-surface border border-border hover:border-cyan-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Zap className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary group-hover:text-cyan-400">
                Architecture Deep Dive
              </h3>
            </div>
            <p className="text-sm text-text-muted">
              Understand the ORAE loop and decision-making process.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
