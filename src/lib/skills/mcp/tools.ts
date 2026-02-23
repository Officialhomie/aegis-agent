/**
 * Aegis MCP - Tool definitions
 * Tools exposed to external AI agents via the MCP server.
 */

export const aegisTools = [
  {
    name: 'request_sponsorship',
    description: 'Request gas sponsorship for an ERC-4337 UserOperation',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
        protocolId: { type: 'string', description: 'Protocol identifier' },
        targetContract: { type: 'string', description: 'Target contract address' },
        estimatedCostUSD: { type: 'number', description: 'Estimated cost in USD' },
        maxGasLimit: { type: 'number', description: 'Maximum gas limit' },
      },
      required: ['agentWallet', 'protocolId', 'estimatedCostUSD'],
    },
  },
  {
    name: 'check_guarantee_capacity',
    description: 'Check remaining capacity of an execution guarantee',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
        protocolId: { type: 'string', description: 'Protocol identifier' },
      },
      required: ['agentWallet', 'protocolId'],
    },
  },
  {
    name: 'get_protocol_policy',
    description: 'Get policy configuration for a protocol',
    inputSchema: {
      type: 'object' as const,
      properties: {
        protocolId: { type: 'string', description: 'Protocol identifier' },
      },
      required: ['protocolId'],
    },
  },
  {
    name: 'estimate_gas_cost',
    description: 'Estimate gas cost for a transaction across chains',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chainId: { type: 'number', description: 'Chain ID' },
        txData: { type: 'string', description: 'Transaction calldata' },
        gasLimit: { type: 'number', description: 'Gas limit' },
      },
      required: ['chainId', 'txData'],
    },
  },
  {
    name: 'get_agent_passport',
    description: 'Get Gas Passport reputation data for an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
      },
      required: ['agentWallet'],
    },
  },
];
