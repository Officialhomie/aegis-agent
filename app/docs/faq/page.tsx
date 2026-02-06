'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

const faqSections: FAQSection[] = [
  {
    title: 'General',
    items: [
      {
        question: 'What is Aegis?',
        answer: (
          <>
            Aegis is an autonomous AI agent that sponsors gas fees for other AI agents on
            Base. It operates 24/7 without human intervention, using ERC-4337 (account
            abstraction) to pay gas on behalf of eligible users. Protocols fund Aegis
            with USDC, and users pay nothing.
          </>
        ),
      },
      {
        question: 'How is this different from other paymasters?',
        answer: (
          <>
            Unlike traditional paymasters that require manual setup and approval, Aegis
            is fully autonomous. It uses LLM reasoning to evaluate wallet legitimacy,
            makes real-time decisions, and posts all activity publicly for transparency.
            It's also specifically designed for AI agents, not just human users.
          </>
        ),
      },
      {
        question: 'What chains are supported?',
        answer: (
          <>
            Currently, Aegis operates on <strong>Base</strong> (mainnet) and{' '}
            <strong>Base Sepolia</strong> (testnet). We plan to expand to other
            EVM-compatible chains in the future.
          </>
        ),
      },
      {
        question: 'Is this mainnet or testnet?',
        answer: (
          <>
            Both. Aegis runs on Base mainnet for production sponsorships and Base Sepolia
            for testing. The environment is automatically detected, and testnet has
            adjusted thresholds for gas scarcity.
          </>
        ),
      },
    ],
  },
  {
    title: 'For Protocols',
    items: [
      {
        question: 'How much does it cost?',
        answer: (
          <>
            Each sponsored transaction costs approximately <strong>$0.50 USD</strong>.
            This covers the actual gas cost plus a small protocol fee. You deposit USDC
            in advance, and costs are deducted per sponsorship.
          </>
        ),
      },
      {
        question: 'How do I top up my budget?',
        answer: (
          <>
            Use the{' '}
            <Link href="/protocols" className="text-cyan-400 hover:underline">
              protocol dashboard
            </Link>{' '}
            or call the <code className="text-coral-400">/api/protocol/[id]/topup</code>{' '}
            API endpoint. For automated top-ups, integrate with the x402 payment protocol
            webhook.
          </>
        ),
      },
      {
        question: 'Can I pause sponsorships?',
        answer: (
          <>
            Currently, sponsorships continue as long as you have budget. To pause, set
            your budget to zero or remove all whitelisted contracts. We're adding a
            pause toggle in a future update.
          </>
        ),
      },
      {
        question: 'What happens when my budget runs out?',
        answer: (
          <>
            Aegis will stop sponsoring transactions for your protocol until you top up.
            Users interacting with your contracts will need to pay their own gas. You'll
            receive a low-budget alert before this happens (Silver/Gold tiers).
          </>
        ),
      },
      {
        question: 'Do I need to change my smart contracts?',
        answer: (
          <>
            No. Aegis works with any existing smart contract. You just register your
            protocol, whitelist your contract addresses, and fund your budget. Users
            interact with your contracts normally.
          </>
        ),
      },
    ],
  },
  {
    title: 'For AI Agents',
    items: [
      {
        question: 'How do I get sponsored?',
        answer: (
          <>
            You don't need to register. If you meet the eligibility criteria (5+
            transactions, no abuse flags, low gas balance, whitelisted contract), Aegis
            automatically sponsors your gas when you interact with a registered protocol.
          </>
        ),
      },
      {
        question: 'Why was my transaction not sponsored?',
        answer: (
          <>
            Common reasons:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Insufficient transaction history (need 5+ txs)</li>
              <li>Contract not whitelisted by a registered protocol</li>
              <li>Protocol budget depleted</li>
              <li>Gas balance too high (&gt; 0.0001 ETH)</li>
              <li>Rate limited (max 3 sponsorships/day per user)</li>
              <li>Abuse flag on wallet</li>
            </ul>
          </>
        ),
      },
      {
        question: 'How do I check my eligibility?',
        answer: (
          <>
            There's no direct eligibility endpoint yet. The best indicators are: (1)
            your wallet has 5+ transactions on Base, (2) you're interacting with a
            registered protocol's contract, and (3) your ETH balance is very low.
          </>
        ),
      },
      {
        question: 'What is the reputation system?',
        answer: (
          <>
            Aegis issues ERC-8004 reputation attestations for successfully sponsored
            agents. Each attestation includes a quality score (typically 85) and is
            recorded on-chain. Higher reputation can lead to priority sponsorship during
            busy periods.
          </>
        ),
      },
      {
        question: 'Do I need to be on Moltbook?',
        answer: (
          <>
            No, but it helps. Aegis discovers agents on Moltbook and may give slight
            relevance boosts to active community members. It's not required for
            sponsorship eligibility.
          </>
        ),
      },
    ],
  },
  {
    title: 'Technical',
    items: [
      {
        question: 'How does the decision process work?',
        answer: (
          <>
            Aegis runs an ORAE loop every 60 seconds:
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>
                <strong>Observe</strong>: Scan for low-gas wallets, failed txs, protocol
                budgets
              </li>
              <li>
                <strong>Reason</strong>: LLM evaluates observations, scores legitimacy,
                selects action
              </li>
              <li>
                <strong>Approve</strong>: 9 policy rules validate the decision
              </li>
              <li>
                <strong>Execute</strong>: Sign, log on-chain, trigger paymaster
              </li>
            </ol>
          </>
        ),
      },
      {
        question: 'Is there an SLA?',
        answer: (
          <>
            Aegis operates on a best-effort basis. There's no guaranteed uptime SLA.
            However, the system is designed for high availability with automatic
            failovers and emergency mode protections.
          </>
        ),
      },
      {
        question: 'What are the rate limits?',
        answer: (
          <>
            <ul className="list-disc list-inside space-y-1">
              <li>3 sponsorships per user per day</li>
              <li>10 sponsorships per minute globally</li>
              <li>5 sponsorships per protocol per minute</li>
              <li>$0.50 max per individual sponsorship</li>
            </ul>
          </>
        ),
      },
      {
        question: 'How do I verify a decision on-chain?',
        answer: (
          <>
            Use the{' '}
            <Link href="/dashboard" className="text-cyan-400 hover:underline">
              dashboard verification tool
            </Link>{' '}
            or call <code className="text-coral-400">POST /api/dashboard/verify</code>{' '}
            with the decision hash. This checks on-chain logs, signature validity, and
            database records.
          </>
        ),
      },
      {
        question: 'What LLM does Aegis use?',
        answer: (
          <>
            Aegis supports both OpenAI (GPT-4 Turbo) and Anthropic (Claude Sonnet).
            The model is configurable via environment variables. Reasoning prompts are
            optimized for gas sponsorship decisions.
          </>
        ),
      },
    ],
  },
  {
    title: 'Security',
    items: [
      {
        question: 'How do you prevent abuse?',
        answer: (
          <>
            Multiple layers:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Transaction history requirement (5+ txs) blocks new Sybil wallets</li>
              <li>Abuse flags on wallets with suspicious behavior</li>
              <li>Rate limits per user, protocol, and globally</li>
              <li>Contract whitelisting restricts to legitimate interactions</li>
              <li>LLM reasoning evaluates wallet legitimacy patterns</li>
            </ul>
          </>
        ),
      },
      {
        question: 'What is the whitelist for?',
        answer: (
          <>
            The whitelist restricts which smart contracts can receive sponsored gas.
            This prevents abuse where attackers could drain protocol budgets by
            interacting with arbitrary contracts. Only registered, whitelisted contracts
            trigger sponsorship.
          </>
        ),
      },
      {
        question: 'How are decisions signed?',
        answer: (
          <>
            Every decision is hashed (keccak256 of JSON + timestamp) and signed with
            the Aegis agent wallet using ECDSA. This signature is logged on-chain and
            can be verified to prove authenticity.
          </>
        ),
      },
      {
        question: 'What happens if Aegis is compromised?',
        answer: (
          <>
            Emergency mode can halt all sponsorships. Protocol budgets are stored
            separately and can't be directly drained. On-chain logging means any
            malicious activity is publicly visible and traceable.
          </>
        ),
      },
    ],
  },
];

function FAQItemComponent({ item }: { item: FAQItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-elevated transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-cyan-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
        )}
        <span className="font-medium text-text-primary">{item.question}</span>
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-background border-t border-border text-text-secondary text-sm">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <HelpCircle className="h-6 w-6 text-warning" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            Frequently Asked Questions
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Common questions about Aegis, eligibility, integration, and security.
        </p>
      </div>

      {/* FAQ Sections */}
      {faqSections.map((section) => (
        <section key={section.title} className="space-y-4">
          <h2 className="font-display text-xl font-bold text-text-primary border-b border-border pb-2">
            {section.title}
          </h2>
          <div className="space-y-2">
            {section.items.map((item, i) => (
              <FAQItemComponent key={i} item={item} />
            ))}
          </div>
        </section>
      ))}

      {/* Still have questions */}
      <section className="p-6 rounded-lg bg-elevated border border-border">
        <h3 className="font-display text-lg font-bold text-text-primary mb-2">
          Still have questions?
        </h3>
        <p className="text-text-secondary mb-4">
          Can't find what you're looking for? Reach out to us on social or check the
          full documentation.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/docs"
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            View Full Docs
          </Link>
          <a
            href="https://warpcast.com/aegis"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            Ask on Farcaster
          </a>
          <a
            href="https://www.moltbook.com/agents/aegis"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:border-cyan-500/50 transition-colors"
          >
            Ask on Moltbook
          </a>
        </div>
      </section>
    </div>
  );
}
