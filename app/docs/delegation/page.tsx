import Link from 'next/link';
import { UserCheck } from 'lucide-react';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';

export default function DelegationDocsPage() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-coral-500/10">
            <UserCheck className="h-6 w-6 text-coral-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            User-to-Agent Delegation
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Users delegate a gas budget and scoped permissions to an agent. The agent
          receives sponsored execution when acting within the delegation; the user&apos;s
          wallet pays (via the delegated budget), not the protocol.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Overview
        </h2>
        <p className="text-text-secondary">
          Delegation is built on EIP-712 signatures and optional ERC-8004 agent
          registration. The delegator signs a message that grants an agent permission to
          use a gas budget under constraints (contract whitelist, function whitelist,
          value limits, rate limits). Aegis validates each sponsorship request against
          the active delegation before sponsoring.
        </p>
        <Callout variant="warning" title="Bearer token required">
          All delegation API endpoints (create, list, get, revoke, usage) require
          <code className="mx-1 px-1 py-0.5 bg-elevated rounded text-coral-400">Authorization: Bearer AEGIS_API_KEY</code>.
          Use your API key when calling from a backend or store it securely when using
          the delegation UI.
        </Callout>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Flow
        </h2>
        <ul className="list-decimal list-inside space-y-2 text-text-secondary">
          <li>Delegator creates a delegation (EIP-712 signature + POST /api/delegation).</li>
          <li>Agent (or user) requests sponsorship with a delegationId; Aegis checks scope, budget, and expiry.</li>
          <li>After sponsorship, delegation gas budget is deducted; usage is recorded.</li>
          <li>Delegator can list delegations, view usage, or revoke (DELETE with X-Delegator-Address).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Permissions schema
        </h2>
        <p className="text-text-secondary">
          Permissions are scoped: contracts (address whitelist), functions (selector
          whitelist), maxValuePerTx (Wei), maxGasPerTx, maxDailySpend (USD), maxTxPerDay,
          maxTxPerHour. Empty arrays mean &quot;all allowed&quot; for that category.
        </p>
        <CodeBlock
          code={`{
  "contracts": ["0x..."],
  "functions": ["0x095ea7b3"],
  "maxValuePerTx": "0",
  "maxGasPerTx": 500000,
  "maxDailySpend": 100,
  "maxTxPerDay": 50,
  "maxTxPerHour": 10
}`}
          language="json"
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Create delegation (POST)
        </h2>
        <p className="text-text-secondary">
          Body must include delegator, agent, permissions, gasBudgetWei, validFrom,
          validUntil, nonce, and EIP-712 signature. The signature is produced off-chain
          by the delegator&apos;s wallet.
        </p>
        <CodeBlock
          code={`POST /api/delegation
Authorization: Bearer <AEGIS_API_KEY>

{
  "delegator": "0x...",
  "agent": "0x...",
  "permissions": { "contracts": [], "functions": [], "maxValuePerTx": "0", "maxGasPerTx": 500000, "maxDailySpend": 100, "maxTxPerDay": 50, "maxTxPerHour": 10 },
  "gasBudgetWei": "1000000000000000",
  "validFrom": "2024-01-15T00:00:00.000Z",
  "validUntil": "2024-02-15T00:00:00.000Z",
  "nonce": "1",
  "signature": "0x..."
}`}
          language="text"
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          List delegations (GET)
        </h2>
        <p className="text-text-secondary">
          Query params: delegator, agent, status (ACTIVE | REVOKED | EXPIRED | EXHAUSTED |
          ALL), limit, offset.
        </p>
        <CodeBlock
          code={`GET /api/delegation?delegator=0x...&agent=0x...&status=ACTIVE&limit=50&offset=0
Authorization: Bearer <AEGIS_API_KEY>`}
          language="text"
        />
        <p className="text-sm text-text-muted">
          To list delegations for an agent by address: <code className="text-cyan-400">GET /api/agent/{'{agentAddress}'}/delegations</code>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Get delegation and usage
        </h2>
        <p className="text-text-secondary">
          GET /api/delegation/[delegationId] returns the delegation. GET
          /api/delegation/[delegationId]/usage returns usage records (txHash, gasUsed,
          success, createdAt).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Revoke delegation (DELETE)
        </h2>
        <p className="text-text-secondary">
          Send X-Delegator-Address header (must match the delegation&apos;s delegator) and
          optional body reason.
        </p>
        <CodeBlock
          code={`DELETE /api/delegation/[delegationId]
Authorization: Bearer <AEGIS_API_KEY>
X-Delegator-Address: 0x...

{ "reason": "No longer needed" }`}
          language="text"
        />
      </section>

      <p className="text-text-muted text-sm">
        Full request/response shapes are in the{' '}
        <Link href="/docs/api" className="text-cyan-400 hover:underline">
          API Reference
        </Link>{' '}
        (Delegation tab). You can also use the <Link href="/delegation" className="text-cyan-400 hover:underline">Delegation</Link> page to list and inspect delegations (with API key).
      </p>
    </div>
  );
}
