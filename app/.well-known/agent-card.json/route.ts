/**
 * A2A Agent Card - discoverability endpoint for agent-to-agent protocol.
 * Advertised in ERC-8004 registration; enables other agents to discover Aegis.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ??
    process.env.AEGIS_DASHBOARD_URL?.trim().replace(/\/$/, '') ??
    '';

  const agentCard = {
    name: 'Aegis',
    description: 'Autonomous Gas Sponsorship Agent on Base',
    url: baseUrl,
    version: '1.0.0',
    capabilities: {
      gasSponsorship: true,
      x402Payments: true,
      erc8004Identity: true,
      transparencyProofs: true,
    },
    skills: [
      'gas-sponsorship',
      'protocol-budget-management',
      'reputation-attestation',
      'agent-discovery',
      'botchan-listener',
      'farcaster-transparency',
    ],
    endpoints: {
      health: '/api/health',
      deepHealth: '/api/health/deep',
      pricing: '/api/agent/price',
      requestStatus: '/api/agent/request-status',
      protocolRegister: '/api/protocol/register',
      dashboard: '/api/dashboard/stats',
      v1: {
        protocolStats: '/api/v1/protocol/:id/stats',
        checkEligibility: '/api/v1/sponsorship/check-eligibility',
        sponsorshipRequest: '/api/v1/sponsorship/request',
      },
    },
    authentication: {
      publicEndpoints: [
        '/api/health',
        '/api/health/deep',
        '/api/health/redis',
        '/api/agent/price',
        '/api/agent/request-status',
        '/api/protocol',
        '/api/protocol/register',
        '/api/protocol/[protocolId]',
        '/api/protocol/[protocolId]/topup',
        '/api/dashboard/status',
        '/api/dashboard/stats',
        '/api/dashboard/activity',
        '/api/dashboard/social',
        '/api/dashboard/verify',
        '/api/v1/protocol/[id]/stats',
        '/api/v1/sponsorship/check-eligibility',
      ],
      apiKeyEndpoints: [
        '/api/agent/register',
        '/api/agent/cycle',
        '/api/agent/status',
        '/api/protocol/[protocolId]/agents',
        '/api/protocol/[protocolId]/deposit-verify',
        '/api/reactive/event',
        '/api/v1/sponsorship/request',
      ],
      webhookEndpoints: [
        { path: '/api/protocol/webhook', auth: 'HMAC (PROTOCOL_WEBHOOK_SECRET)' },
        { path: '/api/botchan/webhook', auth: 'HMAC (BOTCHAN_WEBHOOK_SECRET)' },
      ],
    },
    protocols: { erc8004: true, a2a: true, x402: true },
    chains: [
      { chainId: 8453, name: 'Base' },
      { chainId: 84532, name: 'Base Sepolia' },
    ],
  };

  return Response.json(agentCard, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
