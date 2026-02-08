'use client';

import { useState } from 'react';
import { Code, Server, BarChart3, Webhook, Layers } from 'lucide-react';
import { ApiEndpoint } from '@/components/docs/api-endpoint';
import { Callout } from '@/components/docs/callout';
import { cn } from '@/lib/utils';

type TabId = 'protocol' | 'dashboard' | 'agent' | 'webhook' | 'v1';

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'protocol', label: 'Protocol', icon: Server },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'agent', label: 'Agent', icon: Code },
  { id: 'webhook', label: 'Webhooks', icon: Webhook },
  { id: 'v1', label: 'v1 SDK', icon: Layers },
];

export default function ApiReferencePage() {
  const [activeTab, setActiveTab] = useState<TabId>('protocol');

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-coral-500/10">
            <Code className="h-6 w-6 text-coral-400" />
          </div>
          <h1 className="font-display text-4xl font-bold text-text-primary">
            API Reference
          </h1>
        </div>
        <p className="text-xl text-text-secondary">
          Complete REST API documentation for Aegis. All endpoints return JSON and use
          standard HTTP methods.
        </p>
      </div>

      {/* Base URL */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-text-primary border-b border-border pb-2">
          Base URL
        </h2>
        <div className="p-4 rounded-lg bg-surface border border-border font-mono text-cyan-400">
          https://clawgas.vercel.app/api
        </div>
        <Callout variant="info" title="Authentication">
          Most read endpoints are public. Some require auth:
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li><strong>Public:</strong> health, protocol list/get, dashboard stats, agent price, request-status, v1 protocol stats, v1 check-eligibility</li>
            <li><strong>Bearer token</strong> (Authorization: Bearer AEGIS_API_KEY): agent/cycle, agent/register, agent/status, protocol agents CRUD, deposit-verify, v1 sponsorship/request, reactive/event</li>
            <li><strong>HMAC signature:</strong> protocol/webhook (X-Aegis-Signature), botchan/webhook (X-Botchan-Signature)</li>
          </ul>
          Rate limiting applies to prevent abuse.
        </Callout>
      </section>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Protocol APIs */}
      {activeTab === 'protocol' && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            Protocol Management
          </h2>

          <ApiEndpoint
            method="POST"
            path="/protocol/register"
            description="Register a new protocol sponsor. Creates a new protocol with the specified configuration."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Unique identifier (a-z, 0-9, -, _)' },
              { name: 'name', type: 'string', required: true, description: 'Display name' },
              { name: 'tier', type: 'enum', required: true, description: 'bronze, silver, or gold' },
              { name: 'whitelistedContracts', type: 'string[]', required: false, description: 'Contract addresses to whitelist' },
              { name: 'initialBalanceUSD', type: 'number', required: false, description: 'Starting budget in USD' },
            ]}
            requestBody={`{
  "protocolId": "my-defi-app",
  "name": "My DeFi App",
  "tier": "silver",
  "whitelistedContracts": ["0x1234..."],
  "initialBalanceUSD": 100
}`}
            responseBody={`{
  "protocolId": "my-defi-app",
  "name": "My DeFi App",
  "tier": "silver",
  "balanceUSD": 100,
  "createdAt": "2024-01-15T12:00:00Z"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/protocol"
            description="List all registered protocol sponsors with their current status."
            responseBody={`{
  "protocols": [
    {
      "protocolId": "my-defi-app",
      "name": "My DeFi App",
      "tier": "silver",
      "balanceUSD": 450.00,
      "totalSpent": 50.00,
      "sponsorshipCount": 100
    }
  ],
  "count": 1
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/protocol/{protocolId}"
            description="Get detailed information about a specific protocol."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            responseBody={`{
  "protocolId": "my-defi-app",
  "name": "My DeFi App",
  "tier": "silver",
  "balanceUSD": 450.00,
  "totalSpent": 50.00,
  "sponsorshipCount": 100,
  "whitelistedContracts": ["0x1234..."],
  "createdAt": "2024-01-15T12:00:00Z"
}`}
          />

          <ApiEndpoint
            method="PATCH"
            path="/protocol/{protocolId}"
            description="Update protocol configuration including name, tier, or whitelisted contracts."
            parameters={[
              { name: 'name', type: 'string', required: false, description: 'Updated display name' },
              { name: 'tier', type: 'enum', required: false, description: 'Updated tier' },
              { name: 'whitelistedContracts', type: 'string[]', required: false, description: 'Updated contract list' },
            ]}
            requestBody={`{
  "whitelistedContracts": [
    "0x1234...",
    "0xabcd..."
  ]
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/protocol/{protocolId}/topup"
            description="Credit a protocol's sponsorship budget by verifying an on-chain USDC deposit. Supply the deposit transaction hash and chain ID."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            requestBody={`{
  "txHash": "0x...",
  "chainId": 8453
}`}
            responseBody={`{
  "protocolId": "my-defi-app",
  "balanceUSD": 950.00,
  "creditedAmount": 500
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/protocol/{protocolId}/agents"
            description="List approved agents for a protocol. Requires Bearer token (AEGIS_API_KEY)."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            responseBody={`{
  "agents": [
    { "agentId": "agent-1", "approvedAt": "2024-01-15T12:00:00Z", "config": {} }
  ],
  "count": 1
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/protocol/{protocolId}/agents"
            description="Approve an agent for the protocol. Requires Bearer token (AEGIS_API_KEY)."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            requestBody={`{
  "agentId": "agent-1",
  "config": {}
}`}
            responseBody={`{
  "ok": true,
  "agentId": "agent-1",
  "protocolId": "my-defi-app"
}`}
          />

          <ApiEndpoint
            method="DELETE"
            path="/protocol/{protocolId}/agents"
            description="Revoke an agent's approval for the protocol. Requires Bearer token (AEGIS_API_KEY)."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            requestBody={`{
  "agentId": "agent-1"
}`}
            responseBody={`{
  "ok": true,
  "agentId": "agent-1"
}`}
          />

          <ApiEndpoint
            method="PATCH"
            path="/protocol/{protocolId}/agents"
            description="Update an approved agent's configuration. Requires Bearer token (AEGIS_API_KEY)."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            requestBody={`{
  "agentId": "agent-1",
  "config": { "maxPerDay": 10 }
}`}
            responseBody={`{
  "ok": true,
  "agentId": "agent-1"
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/protocol/{protocolId}/deposit-verify"
            description="Verify an on-chain USDC deposit and credit the protocol budget. Requires Bearer token (AEGIS_API_KEY)."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            requestBody={`{
  "txHash": "0x...",
  "chainId": 8453
}`}
            responseBody={`{
  "ok": true,
  "protocolId": "my-defi-app",
  "creditedAmount": 100,
  "balanceUSD": 550.00
}`}
          />
        </div>
      )}

      {/* Dashboard APIs */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            Dashboard Statistics
          </h2>

          <ApiEndpoint
            method="GET"
            path="/dashboard/status"
            description="Get agent signing capability and current mode (e.g. live, simulation, readonly)."
            responseBody={`{
  "canSign": true,
  "mode": "LIVE",
  "timestamp": "2024-01-15T12:00:00Z"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/dashboard/stats"
            description="Get aggregated sponsorship statistics including today's activity, active protocols, and reserve health."
            responseBody={`{
  "sponsorshipsToday": 47,
  "activeProtocols": 12,
  "reserveHealth": {
    "ETH": 0.5234,
    "USDC": 1500.00,
    "healthy": true,
    "balances": [
      { "chainId": 8453, "chainName": "Base", "ETH": 0.5234, "USDC": 1500 }
    ]
  },
  "timestamp": "2024-01-15T12:00:00Z"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/dashboard/activity"
            description="Get recent sponsorship activity records with pagination."
            parameters={[
              { name: 'limit', type: 'number', required: false, description: 'Max records to return (default: 20)' },
              { name: 'offset', type: 'number', required: false, description: 'Number of records to skip' },
            ]}
            responseBody={`{
  "activity": [
    {
      "id": "abc123",
      "userAddress": "0x1234...",
      "protocolId": "my-defi-app",
      "decisionHash": "0xabcd...",
      "estimatedCostUSD": 0.45,
      "actualCostUSD": 0.43,
      "txHash": "0xdef0...",
      "createdAt": "2024-01-15T11:30:00Z"
    }
  ],
  "count": 1
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/dashboard/verify"
            description="Verify a sponsorship decision by checking on-chain logs and signature validity."
            parameters={[
              { name: 'decisionHash', type: 'string', required: true, description: 'The keccak256 hash of the decision' },
            ]}
            requestBody={`{
  "decisionHash": "0xabcd1234..."
}`}
            responseBody={`{
  "decisionHash": "0xabcd1234...",
  "onChain": true,
  "signatureValid": true,
  "record": {
    "userAddress": "0x1234...",
    "protocolId": "my-defi-app",
    "estimatedCostUSD": 0.45,
    "txHash": "0xdef0...",
    "createdAt": "2024-01-15T11:30:00Z"
  },
  "onChainEvent": {
    "user": "0x1234...",
    "protocolId": "my-defi-app",
    "timestamp": "1705316400"
  }
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/dashboard/social"
            description="Get Moltbook and Farcaster social activity status."
            responseBody={`{
  "moltbook": {
    "connected": true,
    "profile": { "name": "Aegis", "karma": 150 },
    "karma": 150,
    "followers": 23,
    "postsCount": 47
  },
  "farcaster": {
    "lastPost": "2024-01-15T11:00:00Z",
    "postIntervalMinutes": 15
  },
  "engagement": {
    "totalUpvotesGiven": 89,
    "totalRepliesSent": 34,
    "totalPostsCreated": 47
  }
}`}
          />
        </div>
      )}

      {/* Agent APIs */}
      {activeTab === 'agent' && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            Agent Management
          </h2>

          <Callout variant="warning" title="Authentication Required">
            Agent APIs require the AEGIS_API_KEY environment variable to be set. These
            endpoints are for internal use.
          </Callout>

          <ApiEndpoint
            method="POST"
            path="/agent/cycle"
            description="Trigger a single observe-reason-execute cycle. Used for manual intervention or testing."
            parameters={[
              { name: 'confidenceThreshold', type: 'number', required: false, description: 'Override confidence threshold (0-1)' },
              { name: 'maxTransactionValueUsd', type: 'number', required: false, description: 'Override max transaction value' },
              { name: 'executionMode', type: 'enum', required: false, description: 'LIVE, SIMULATION, or READONLY' },
            ]}
            requestBody={`{
  "confidenceThreshold": 0.9,
  "executionMode": "SIMULATION"
}`}
            responseBody={`{
  "ok": true,
  "state": {
    "observationsCount": 5,
    "currentDecision": {
      "action": "SPONSOR_TRANSACTION",
      "confidence": 0.95,
      "agentWallet": "0x1234..."
    },
    "hasExecutionResult": true
  }
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/agent/status"
            description="Check agent health and uptime status."
            responseBody={`{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "uptime": 86400
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/agent/price"
            description="Get x402 pricing for sponsorship actions."
            parameters={[
              { name: 'action', type: 'string', required: false, description: 'Action type (default: sponsorship)' },
              { name: 'token', type: 'string', required: false, description: 'Payment token (default: USDC)' },
              { name: 'amount', type: 'number', required: false, description: 'Requested amount' },
            ]}
            responseBody={`{
  "price": "0.015",
  "priceWei": "15000000",
  "currency": "USDC",
  "breakdown": {
    "baseFee": "0.015",
    "gasEstimate": "0",
    "markup": "0"
  },
  "validFor": 300
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/agent/register"
            description="Register the agent with the ERC-8004 Identity Registry."
            responseBody={`{
  "agentId": "12345",
  "txHash": "0xabcd...",
  "registryAddress": "0x8004..."
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/agent/request-status/{id}"
            description="Get sponsorship request status by request ID (e.g. pending, completed, failed)."
            parameters={[
              { name: 'id', type: 'string', required: true, description: 'Request ID (path parameter)' },
            ]}
            responseBody={`{
  "id": "req_abc123",
  "status": "pending",
  "createdAt": "2024-01-15T12:00:00Z",
  "updatedAt": "2024-01-15T12:01:00Z"
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/agent/request-status/{id}"
            description="Cancel a pending sponsorship request. Requires Bearer token for authenticated requests."
            parameters={[
              { name: 'id', type: 'string', required: true, description: 'Request ID (path parameter)' },
            ]}
            requestBody={`{}`}
            responseBody={`{
  "ok": true,
  "id": "req_abc123",
  "status": "cancelled"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/.well-known/agent-card.json"
            description="A2A agent card for discovery (served at app root or under /api depending on deployment)."
            responseBody={`{
  "name": "Aegis",
  "description": "Sponsorship agent",
  "url": "https://clawgas.vercel.app",
  "capabilities": []
}`}
          />
        </div>
      )}

      {/* Webhook APIs */}
      {activeTab === 'webhook' && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            Webhook Endpoints
          </h2>

          <Callout variant="info" title="Signature Verification">
            All webhook requests include an HMAC-SHA256 signature. Always verify signatures
            before processing webhook payloads.
          </Callout>

          <ApiEndpoint
            method="POST"
            path="/protocol/webhook"
            description="Receive x402 payment confirmation webhooks. Automatically credits protocol balance."
            parameters={[
              { name: 'protocolId', type: 'string', required: true, description: 'Protocol receiving payment' },
              { name: 'amountUSD', type: 'number', required: true, description: 'Payment amount' },
              { name: 'paymentId', type: 'string', required: false, description: 'External payment reference' },
            ]}
            requestBody={`{
  "protocolId": "my-defi-app",
  "amountUSD": 100,
  "paymentId": "pay_abc123"
}`}
            responseBody={`{
  "ok": true,
  "protocolId": "my-defi-app",
  "balanceUSD": 550.00,
  "creditedAmount": 100
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/reactive/event"
            description="Receive Reactive Network event callbacks for on-chain events."
            parameters={[
              { name: 'eventType', type: 'string', required: true, description: 'Type of on-chain event' },
              { name: 'payload', type: 'object', required: true, description: 'Event-specific data' },
            ]}
            requestBody={`{
  "eventType": "LowGasDetected",
  "payload": {
    "wallet": "0x1234...",
    "balance": "0.00001",
    "chainId": 8453
  }
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/botchan/webhook"
            description="Receive sponsorship requests from Botchan agent messaging."
            parameters={[
              { name: 'feed', type: 'string', required: true, description: 'Botchan feed name' },
              { name: 'message', type: 'string', required: true, description: 'Request message content' },
              { name: 'sender', type: 'string', required: true, description: 'Requesting agent identifier' },
            ]}
            requestBody={`{
  "feed": "aegis-requests",
  "message": "Requesting sponsorship for 0x1234...",
  "sender": "trading-bot-alpha"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/botchan/webhook"
            description="Health check for the Botchan webhook endpoint."
            responseBody={`{
  "status": "ok",
  "endpoint": "/api/botchan/webhook",
  "configured": true
}`}
          />
        </div>
      )}

      {/* v1 SDK APIs */}
      {activeTab === 'v1' && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            v1 SDK
          </h2>
          <p className="text-text-secondary text-sm">
            Stable v1 endpoints for protocol stats, eligibility checks, and sponsorship requests.
          </p>

          <ApiEndpoint
            method="GET"
            path="/v1/protocol/{id}/stats"
            description="Get rich protocol statistics (balance, spend, sponsorship counts, etc.)."
            parameters={[
              { name: 'id', type: 'string', required: true, description: 'Protocol identifier (path parameter)' },
            ]}
            responseBody={`{
  "protocolId": "my-defi-app",
  "balanceUSD": 450.00,
  "totalSpent": 50.00,
  "sponsorshipCount": 100,
  "activeAgents": 3
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/v1/sponsorship/check-eligibility"
            description="Dry-run eligibility check for a sponsorship request (no auth required)."
            requestBody={`{
  "userAddress": "0x1234...",
  "protocolId": "my-defi-app",
  "action": "sponsorship"
}`}
            responseBody={`{
  "eligible": true,
  "reason": null,
  "estimatedCostUSD": 0.015
}`}
          />

          <ApiEndpoint
            method="POST"
            path="/v1/sponsorship/request"
            description="Queue a sponsorship request. Requires Bearer token (AEGIS_API_KEY)."
            requestBody={`{
  "userAddress": "0x1234...",
  "protocolId": "my-defi-app",
  "payload": {}
}`}
            responseBody={`{
  "requestId": "req_abc123",
  "status": "pending",
  "createdAt": "2024-01-15T12:00:00Z"
}`}
          />
        </div>
      )}

      {/* Health endpoint */}
      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="font-display text-xl font-bold text-text-primary">
          Health Check
        </h2>

          <ApiEndpoint
            method="GET"
            path="/health"
            description="Get system health status including reserve state and emergency mode status."
            responseBody={`{
  "status": "healthy",
  "healthScore": 87,
  "ethBalance": 0.5234,
  "usdcBalance": 1500.00,
  "runwayDays": 45.2,
  "emergencyMode": false,
  "protocolBudgets": [
    {
      "protocolId": "my-defi-app",
      "balanceUSD": 450,
      "burnRateUSDPerDay": 10
    }
  ]
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/health/deep"
            description="Deep health check for Prometheus or quick-mode checks; includes dependencies."
            responseBody={`{
  "status": "healthy",
  "checks": { "redis": "ok", "signer": "ok" },
  "timestamp": "2024-01-15T12:00:00Z"
}`}
          />

          <ApiEndpoint
            method="GET"
            path="/health/redis"
            description="Redis connectivity check."
            responseBody={`{
  "status": "ok",
  "connected": true
}`}
          />
      </section>
    </div>
  );
}
