import Link from 'next/link';
import { Cog, Eye, Brain, Shield, Zap, Database, Globe, Users } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';

export default function ArchitectureDocsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Cog className="h-6 w-6 text-cyan-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            Architecture
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Deep dive into Aegis's autonomous architecture: the ORAE loop, decision flow,
          on-chain components, and state management.
        </p>
      </div>

      {/* ORAE Loop */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          ORAE Architecture
        </h2>

        <p className="text-text-secondary">
          Aegis runs a continuous <strong className="text-text-primary">Observe-Reason-Approve-Execute</strong> loop,
          making autonomous decisions every 60 seconds.
        </p>

        <div className="p-6 rounded-lg bg-surface border border-border font-mono text-sm overflow-x-auto">
          <pre className="text-text-secondary whitespace-pre">
{`┌─────────────────────────────────────────────────────────────────────┐
│                        ORAE Architecture                             │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│     OBSERVE     │     REASON      │     APPROVE     │    EXECUTE    │
│                 │                 │    (Policy)     │               │
│ • Low gas       │ • LLM eval      │ • Budget check  │ • Sign        │
│   wallets       │ • Confidence    │ • Rate limits   │ • Log chain   │
│ • Failed txs    │   scoring       │ • Whitelist     │ • Paymaster   │
│ • New wallets   │ • Decision      │ • Gas price     │ • IPFS        │
│ • Protocol      │   selection     │ • User caps     │ • DB record   │
│   budgets       │                 │                 │               │
└─────────────────┴─────────────────┴─────────────────┴───────────────┘`}
          </pre>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Eye className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-text-primary">Observe</h3>
            </div>
            <p className="text-sm text-text-muted">
              Scans Base blockchain for low-gas wallets, failed transactions, and new wallet
              activations. Queries protocol budgets and reserve state.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Brain className="h-5 w-5 text-coral-400" />
              <h3 className="font-semibold text-text-primary">Reason</h3>
            </div>
            <p className="text-sm text-text-muted">
              LLM (GPT-4 or Claude) evaluates observations, scores wallet legitimacy,
              and selects the best action with confidence score.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="h-5 w-5 text-warning" />
              <h3 className="font-semibold text-text-primary">Approve (Policy)</h3>
            </div>
            <p className="text-sm text-text-muted">
              10 safety rules validate every decision. Budget checks, rate limits, whitelist
              verification, and gas price optimization.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="h-5 w-5 text-success" />
              <h3 className="font-semibold text-text-primary">Execute</h3>
            </div>
            <p className="text-sm text-text-muted">
              Signs decision, logs on-chain, uploads to IPFS, updates database, and
              triggers the Base Paymaster for sponsorship.
            </p>
          </div>
        </div>
      </section>

      {/* Decision Actions */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Decision Actions
        </h2>

        <p className="text-text-secondary">
          The reasoning phase selects one of these actions based on current observations:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-text-muted font-medium">Action</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Description</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Parameters</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">SPONSOR_TRANSACTION</td>
                <td className="py-3 px-4">Sponsor gas for an eligible agent</td>
                <td className="py-3 px-4 text-text-muted">agentWallet, protocolId, estimatedCostUSD</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">SWAP_RESERVES</td>
                <td className="py-3 px-4">Swap USDC to ETH when reserves low</td>
                <td className="py-3 px-4 text-text-muted">tokenIn, tokenOut, amountIn</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">ALERT_PROTOCOL</td>
                <td className="py-3 px-4">Notify protocol of low budget</td>
                <td className="py-3 px-4 text-text-muted">protocolId, severity, budgetRemaining</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">WAIT</td>
                <td className="py-3 px-4">No action needed this cycle</td>
                <td className="py-3 px-4 text-text-muted">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Policy Rules */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Policy Rules
        </h2>

        <Callout variant="warning" title="Fail-Closed Security">
          All policy rules have ERROR severity. If any rule fails, the decision is rejected.
          Aegis never sponsors transactions that don't pass all checks.
        </Callout>

        <div className="space-y-3">
          {[
            { rule: 'user-legitimacy-check', desc: 'Agent has 5+ historical transactions, no abuse flags' },
            { rule: 'protocol-budget-check', desc: 'Protocol has sufficient USD balance for sponsorship' },
            { rule: 'agent-reserve-check', desc: 'Agent wallet has minimum 0.1 ETH reserves' },
            { rule: 'daily-cap-per-user', desc: 'Max 3 sponsorships per user per day' },
            { rule: 'global-rate-limit', desc: 'Max 10 sponsorships per minute globally' },
            { rule: 'per-protocol-rate-limit', desc: 'Max 5 sponsorships per protocol per minute' },
            { rule: 'per-sponsorship-cost-cap', desc: 'Max $0.50 per individual sponsorship' },
            { rule: 'contract-whitelist-check', desc: 'Target contract in protocol whitelist' },
            { rule: 'gas-price-optimization', desc: 'Base gas price under 2 Gwei' },
          ].map((item) => (
            <div
              key={item.rule}
              className="flex items-start gap-3 p-3 rounded-lg bg-surface border border-border"
            >
              <Shield className="h-4 w-4 text-warning shrink-0 mt-1" />
              <div>
                <span className="font-mono text-coral-400 text-sm">{item.rule}</span>
                <p className="text-sm text-text-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* On-Chain Components */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          On-Chain Components
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">AegisActivityLogger</h3>
            <p className="text-sm text-text-muted mb-3">
              Records every sponsorship decision on Base with user, protocol, decision hash,
              and estimated cost.
            </p>
            <code className="text-xs text-cyan-400 break-all">
              Base: 0x...ActivityLogger
            </code>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">Base Paymaster</h3>
            <p className="text-sm text-text-muted mb-3">
              ERC-4337 paymaster that validates Aegis signatures and sponsors UserOperations.
            </p>
            <code className="text-xs text-cyan-400 break-all">
              Via Pimlico bundler RPC
            </code>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">ERC-8004 Registry</h3>
            <p className="text-sm text-text-muted mb-3">
              On-chain reputation attestations. Aegis submits quality scores for sponsored agents.
            </p>
            <code className="text-xs text-cyan-400 break-all">
              Base Sepolia: 0x8004...Registry
            </code>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <h3 className="font-semibold text-text-primary mb-2">IPFS Backup</h3>
            <p className="text-sm text-text-muted mb-3">
              Full decision JSON stored immutably. CID returned with each sponsorship for
              verification.
            </p>
            <code className="text-xs text-cyan-400 break-all">
              ipfs://Qm...
            </code>
          </div>
        </div>
      </section>

      {/* State Management */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          State Management
        </h2>

        <div className="flex items-start gap-4 p-4 rounded-lg bg-surface border border-border">
          <Database className="h-6 w-6 text-cyan-400 shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-text-primary">Reserve State</h3>
            <p className="text-text-secondary text-sm mt-1">
              Central coordination hub for reserve pipeline and gas sponsorship modes.
              Stored in Redis (or in-memory fallback).
            </p>
          </div>
        </div>

        <CodeBlock
          language="typescript"
          code={`interface ReserveState {
  ethBalance: number;          // Current ETH for sponsorships
  usdcBalance: number;         // USDC (convertible)
  chainId: number;             // 8453 (Base) or 84532 (Sepolia)
  healthScore: number;         // 0-100 composite score
  sponsorshipsLast24h: number;
  dailyBurnRateETH: number;
  runwayDays: number;
  emergencyMode: boolean;      // Halt sponsorships if true
  protocolBudgets: ProtocolBudgetState[];
}`}
        />

        <h3 className="font-semibold text-text-primary mt-6">Health Score Formula</h3>
        <p className="text-text-secondary mb-4">
          The health score is a weighted composite of three factors:
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border text-center">
            <div className="text-2xl font-bold text-cyan-400 mb-2">40%</div>
            <h4 className="font-semibold text-text-primary">Balance Ratio</h4>
            <p className="text-xs text-text-muted">vs adaptive target</p>
          </div>
          <div className="p-4 rounded-lg bg-surface border border-border text-center">
            <div className="text-2xl font-bold text-coral-400 mb-2">40%</div>
            <h4 className="font-semibold text-text-primary">Runway Health</h4>
            <p className="text-xs text-text-muted">days of operation</p>
          </div>
          <div className="p-4 rounded-lg bg-surface border border-border text-center">
            <div className="text-2xl font-bold text-success mb-2">20%</div>
            <h4 className="font-semibold text-text-primary">Activity Bonus</h4>
            <p className="text-xs text-text-muted">sponsorship volume</p>
          </div>
        </div>
      </section>

      {/* Social Integrations */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Social Integrations
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Globe className="h-5 w-5 text-purple-400" />
              <h3 className="font-semibold text-text-primary">Farcaster</h3>
            </div>
            <p className="text-sm text-text-muted">
              Transparency posts every 15 minutes. Health summaries, sponsorship proofs,
              and personality-driven updates.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Users className="h-5 w-5 text-orange-400" />
              <h3 className="font-semibold text-text-primary">Moltbook</h3>
            </div>
            <p className="text-sm text-text-muted">
              Agent discovery, community engagement, and comment replies. Finds relevant
              DeFi agents automatically.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="h-5 w-5 text-blue-400" />
              <h3 className="font-semibold text-text-primary">Botchan</h3>
            </div>
            <p className="text-sm text-text-muted">
              On-chain agent messaging. Posts sponsorship summaries and receives direct
              sponsorship requests.
            </p>
          </div>
        </div>
      </section>

      {/* Skills System */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Skills System
        </h2>

        <p className="text-text-secondary">
          Aegis uses a modular skills system for extensible capabilities:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-text-muted font-medium">Skill</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Trigger</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Interval</th>
                <th className="text-left py-3 px-4 text-text-muted font-medium">Function</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">moltbook-conversationalist</td>
                <td className="py-3 px-4">schedule</td>
                <td className="py-3 px-4">30 min</td>
                <td className="py-3 px-4">Reply to comments on Aegis posts</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">botchan-listener</td>
                <td className="py-3 px-4">schedule + event</td>
                <td className="py-3 px-4">1 min</td>
                <td className="py-3 px-4">Process sponsorship requests</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">agent-discovery</td>
                <td className="py-3 px-4">schedule</td>
                <td className="py-3 px-4">4 hours</td>
                <td className="py-3 px-4">Find agents on Moltbook</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 font-mono text-cyan-400">reputation-attestor</td>
                <td className="py-3 px-4">event</td>
                <td className="py-3 px-4">on success</td>
                <td className="py-3 px-4">Issue ERC-8004 attestations</td>
              </tr>
            </tbody>
          </table>
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
            href="/docs/api"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            View API Reference
          </Link>
        </div>
      </section>
    </div>
  );
}
