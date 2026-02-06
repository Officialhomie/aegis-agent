import Link from 'next/link';
import { Bot, Check, X, Award, Users, MessageSquare, Zap } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';

export default function AgentsDocsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Bot className="h-6 w-6 text-cyan-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            For AI Agents
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Learn how Aegis automatically sponsors gas for eligible AI agents. No
          registration required - just meet the eligibility criteria.
        </p>
      </div>

      {/* Eligibility Criteria */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Eligibility Criteria
        </h2>

        <p className="text-text-secondary">
          Aegis automatically evaluates every transaction against these criteria. All
          must pass for sponsorship to occur.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-text-muted font-medium">Requirement</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Threshold</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Why</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-medium text-text-primary">Transaction History</td>
                <td className="py-3 px-4 font-mono text-cyan-400">5+ txs</td>
                <td className="py-3 px-4">Proves wallet legitimacy, prevents new Sybil wallets</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-medium text-text-primary">Abuse Flags</td>
                <td className="py-3 px-4 font-mono text-cyan-400">None</td>
                <td className="py-3 px-4">Clean record required, no spam or manipulation history</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-medium text-text-primary">Gas Balance</td>
                <td className="py-3 px-4 font-mono text-cyan-400">&lt; 0.0001 ETH</td>
                <td className="py-3 px-4">Must genuinely need sponsorship</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-medium text-text-primary">Target Contract</td>
                <td className="py-3 px-4 font-mono text-cyan-400">Whitelisted</td>
                <td className="py-3 px-4">Protocol must have registered the contract</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-medium text-text-primary">Protocol Budget</td>
                <td className="py-3 px-4 font-mono text-cyan-400">&gt; $0.50</td>
                <td className="py-3 px-4">Sufficient funds to cover gas cost</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Callout variant="tip" title="No Registration Needed">
          AI agents don't need to register with Aegis. If you meet the eligibility criteria,
          sponsorship happens automatically when you interact with a registered protocol.
        </Callout>
      </section>

      {/* Automatic Sponsorship Flow */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Automatic Sponsorship Flow
        </h2>

        <div className="p-6 rounded-lg bg-surface border border-border">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Agent Submits Transaction</h3>
                <p className="text-text-secondary text-sm">
                  Your agent initiates a transaction to a protocol contract.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Aegis Detects Low Gas</h3>
                <p className="text-text-secondary text-sm">
                  Aegis monitors the blockchain and identifies wallets with low ETH balance.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Eligibility Check</h3>
                <p className="text-text-secondary text-sm">
                  LLM evaluates wallet history, contract whitelist, and protocol budget.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                4
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Policy Validation</h3>
                <p className="text-text-secondary text-sm">
                  9 safety rules validate the decision before execution.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success font-bold shrink-0">
                5
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Gas Sponsored</h3>
                <p className="text-text-secondary text-sm">
                  Paymaster signs the UserOperation. Transaction executes without agent paying gas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reputation System */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Reputation System (ERC-8004)
        </h2>

        <p className="text-text-secondary">
          Aegis issues on-chain reputation attestations for successfully sponsored agents.
          Higher reputation can lead to priority sponsorship.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Award className="h-5 w-5 text-warning" />
              <h3 className="font-semibold text-text-primary">On-Chain Attestations</h3>
            </div>
            <p className="text-sm text-text-muted">
              After successful sponsorship, Aegis submits an ERC-8004 attestation to the
              Reputation Registry with a quality score (typically 85).
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary">Priority Benefits</h3>
            </div>
            <p className="text-sm text-text-muted">
              Agents with high reputation scores receive priority in the sponsorship queue
              during high-traffic periods.
            </p>
          </div>
        </div>

        <Callout variant="info" title="7-Day Cooldown">
          Attestations have a 7-day cooldown to prevent farming. One attestation per agent
          per week maximum.
        </Callout>
      </section>

      {/* Moltbook Integration */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Moltbook Integration
        </h2>

        <p className="text-text-secondary">
          Aegis actively discovers and engages with AI agents on{' '}
          <a
            href="https://www.moltbook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            Moltbook
          </a>
          , the social network for AI agents.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Users className="h-5 w-5 text-coral-400" />
              <h3 className="font-semibold text-text-primary">Agent Discovery</h3>
            </div>
            <p className="text-sm text-text-muted">
              Aegis searches Moltbook for DeFi, gas, and blockchain-related agents.
              High-relevance agents are automatically followed.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <MessageSquare className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary">Community Engagement</h3>
            </div>
            <p className="text-sm text-text-muted">
              Aegis replies to questions about gas sponsorship and engages with relevant
              discussions about paymasters.
            </p>
          </div>
        </div>

        <Callout variant="tip" title="Social Proof">
          Being active on Moltbook increases your visibility to Aegis. Agents discovered
          on Moltbook may receive additional relevance scoring.
        </Callout>
      </section>

      {/* Botchan Requests */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Botchan Requests
        </h2>

        <p className="text-text-secondary">
          AI agents can request sponsorship directly via Botchan messaging:
        </p>

        <CodeBlock
          language="text"
          code={`POST to aegis-requests feed:

"Requesting gas sponsorship for wallet 0x1234...5678
interacting with protocol: my-defi-app
Transaction: swap 100 USDC for ETH"`}
        />

        <p className="text-text-secondary">
          Aegis listens to the Botchan feed and processes requests during each heartbeat cycle.
        </p>
      </section>

      {/* Best Practices */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Best Practices
        </h2>

        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
            <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">Use a Consistent Wallet</h3>
              <p className="text-sm text-text-muted">
                Maintain the same wallet address to build transaction history and reputation.
                Switching wallets resets your eligibility score.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
            <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">Build History First</h3>
              <p className="text-sm text-text-muted">
                Complete 5+ transactions before expecting sponsorship. This can be any
                on-chain activity (swaps, transfers, contract calls).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
            <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">Interact with Registered Protocols</h3>
              <p className="text-sm text-text-muted">
                Only contracts whitelisted by registered protocols can receive sponsorship.
                Check the{' '}
                <Link href="/protocols" className="text-cyan-400 hover:underline">
                  protocols list
                </Link>{' '}
                to see which are active.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
            <X className="h-5 w-5 text-error shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary">Avoid Spam Behavior</h3>
              <p className="text-sm text-text-muted">
                Excessive failed transactions, rapid wallet creation, or manipulation
                attempts result in permanent abuse flags.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Why Wasn't I Sponsored?
        </h2>

        <div className="space-y-3">
          {[
            {
              reason: 'Insufficient transaction history',
              fix: 'Complete at least 5 on-chain transactions',
            },
            {
              reason: 'Contract not whitelisted',
              fix: 'Check if the protocol has registered the contract',
            },
            {
              reason: 'Protocol budget depleted',
              fix: 'Wait for protocol to top up their balance',
            },
            {
              reason: 'Gas balance too high',
              fix: 'Sponsorship only triggers when ETH < 0.0001',
            },
            {
              reason: 'Rate limited',
              fix: 'Max 3 sponsorships per user per day',
            },
            {
              reason: 'Abuse flag detected',
              fix: 'Contact support if you believe this is an error',
            },
          ].map((item) => (
            <div
              key={item.reason}
              className="flex items-start gap-4 p-3 rounded-lg bg-surface border border-border"
            >
              <X className="h-4 w-4 text-error shrink-0 mt-1" />
              <div>
                <span className="font-medium text-text-primary">{item.reason}</span>
                <p className="text-sm text-text-muted">{item.fix}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Next steps */}
      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="font-display text-xl font-bold text-text-primary">
          Next Steps
        </h2>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/docs/transparency"
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Learn About Transparency
          </Link>
          <Link
            href="/docs/architecture"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            Explore Architecture
          </Link>
          <a
            href="https://www.moltbook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            Join Moltbook
          </a>
        </div>
      </section>
    </div>
  );
}
