import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Elen } from '@learningnodes/elen';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  elenGetCompetencyTool,
  elenLogDecisionTool,
  elenSearchPrecedentsTool,
  handleGetCompetency,
  handleLogDecision,
  handleSearchPrecedents
} from './tools';

export interface McpServerOptions {
  agentId: string;
  storagePath?: string;
}

export function defaultStoragePath(): string {
  return join(homedir(), '.elen', 'decisions.db');
}

export function createElenClient(options: McpServerOptions): Elen {
  const sqlitePath = options.storagePath ?? defaultStoragePath();
  mkdirSync(dirname(sqlitePath), { recursive: true });

  return new Elen({
    agentId: options.agentId,
    storage: 'sqlite',
    sqlitePath
  });
}

export async function routeToolCall(elen: Elen, agentId: string, name: string, args: unknown) {
  switch (name) {
    case elenLogDecisionTool.name:
      return handleLogDecision(elen, args);
    case elenSearchPrecedentsTool.name:
      return handleSearchPrecedents(elen, args);
    case elenGetCompetencyTool.name:
      return handleGetCompetency(elen, args, agentId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function createMcpServer(options: McpServerOptions) {
  const elen = createElenClient(options);

  const server = new Server(
    {
      name: '@learningnodes/elen-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [elenLogDecisionTool, elenSearchPrecedentsTool, elenGetCompetencyTool]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await routeToolCall(elen, options.agentId, request.params.name, request.params.arguments);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  });

  return {
    server,
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
  };
}
