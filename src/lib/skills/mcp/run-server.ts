/**
 * Run the Aegis MCP server (stdio transport).
 * Usage: npm run mcp:server
 * Or: tsx src/lib/skills/mcp/run-server.ts
 */

import { AegisMCPServer } from './server';

const apiBaseUrl = process.env.AEGIS_API_BASE_URL ?? 'http://localhost:3000';

const server = new AegisMCPServer({ apiBaseUrl });
server.start().catch((err) => {
  console.error(err);
  process.exit(1);
});
