/**
 * Aegis MCP Server
 * Exposes Aegis capabilities to external AI agents via Model Context Protocol (stdio transport).
 */

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types';
import { aegisTools } from './tools';
import { initializeSkillRegistry } from '../registry';
import { executeSkill } from '../executor';

export interface AegisMCPServerOptions {
  /** Base URL for Aegis API (e.g. http://localhost:3000). Used by tool implementations. */
  apiBaseUrl?: string;
}

/**
 * MCP server that exposes Aegis tools to AI agents.
 */
export class AegisMCPServer {
  private server: Server;
  private options: AegisMCPServerOptions;

  constructor(options: AegisMCPServerOptions = {}) {
    this.options = options;
    this.server = new Server(
      {
        name: 'aegis-agent',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: aegisTools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const argsObj = (args as Record<string, unknown>) ?? {};

      try {
        let text: string;
        switch (name) {
          case 'request_sponsorship':
            text = await this.requestSponsorship(argsObj);
            break;
          case 'check_guarantee_capacity':
            text = await this.checkGuaranteeCapacity(argsObj);
            break;
          case 'get_protocol_policy':
            text = await this.getProtocolPolicy(argsObj);
            break;
          case 'estimate_gas_cost':
            text = await this.estimateGasCost(argsObj);
            break;
          case 'get_agent_passport':
            text = await this.getAgentPassport(argsObj);
            break;
          default:
            text = JSON.stringify({ error: `Unknown tool: ${name}` });
        }
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] };
      }
    });
  }

  async start(): Promise<void> {
    await initializeSkillRegistry();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Aegis MCP Server running on stdio');
  }

  private async requestSponsorship(args: Record<string, unknown>): Promise<string> {
    const base = this.options.apiBaseUrl ?? 'http://localhost:3000';
    const body = {
      agentWallet: args.agentWallet,
      protocolId: args.protocolId,
      targetContract: args.targetContract,
      estimatedCostUSD: args.estimatedCostUSD,
      maxGasLimit: args.maxGasLimit ?? 200000,
    };
    try {
      const res = await fetch(`${base}/api/agent/cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return JSON.stringify({ status: res.status, data }, null, 2);
    } catch (e) {
      return JSON.stringify({
        error: 'Aegis API unreachable. Set apiBaseUrl or run Aegis locally.',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async checkGuaranteeCapacity(args: Record<string, unknown>): Promise<string> {
    const base = this.options.apiBaseUrl ?? 'http://localhost:3000';
    const agentWallet = args.agentWallet as string;
    const protocolId = args.protocolId as string;
    if (!agentWallet || !protocolId) {
      return JSON.stringify({ error: 'agentWallet and protocolId required' });
    }
    try {
      const url = `${base}/api/v1/guarantees?protocolId=${encodeURIComponent(protocolId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${protocolId}` } });
      const data = await res.json().catch(() => ({}));
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return JSON.stringify({
        error: 'Failed to fetch guarantees',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async getProtocolPolicy(args: Record<string, unknown>): Promise<string> {
    const protocolId = args.protocolId as string;
    if (!protocolId) return JSON.stringify({ error: 'protocolId required' });
    return JSON.stringify({
      message: 'Protocol policy is stored in Aegis DB. Use Aegis API or dashboard for full policy.',
      protocolId,
    });
  }

  private async estimateGasCost(args: Record<string, unknown>): Promise<string> {
    const chainId = (args.chainId as number) ?? 8453;
    const gasLimit = (args.gasLimit as number) ?? 200000;
    const result = await executeSkill('aegis-gas-estimation', {
      chainId,
      estimatedCostUSD: 0,
      currentGasPrice: BigInt(1e9),
    });
    return JSON.stringify({
      reasoning: result.reasoning,
      confidence: result.confidence,
      chainId,
      gasLimit,
      note: 'Use current RPC gas price and ETH/USD for exact USD estimate.',
    });
  }

  private async getAgentPassport(args: Record<string, unknown>): Promise<string> {
    const agentWallet = args.agentWallet as string;
    if (!agentWallet) return JSON.stringify({ error: 'agentWallet required' });
    const base = this.options.apiBaseUrl ?? 'http://localhost:3000';
    try {
      const url = `${base}/api/v1/passport/${encodeURIComponent(agentWallet)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return JSON.stringify({
        error: 'Failed to fetch passport. Ensure Aegis API is running.',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
