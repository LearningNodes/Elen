import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Elen } from '@learningnodes/elen';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  elenCommitTool,
  elenSuggestTool,
  elenExpandTool,
  elenSupersedeTool,
  elenGetCompetencyTool,
  elenGetContextTool,
  elenLogDecisionTool,
  elenSearchPrecedentsTool,
  handleCommit,
  handleSuggest,
  handleExpand,
  handleSupersede,
  handleGetCompetency,
  handleGetContext,
  handleLogDecision,
  handleSearchPrecedents
} from './tools';

export interface McpServerOptions {
  agentId: string;
  projectId?: string;
  storagePath?: string;
}

export function defaultStoragePath(): string {
  return join(homedir(), '.elen', 'decisions.db');
}

export function createElenClient(options: McpServerOptions): Elen {
  const sqlitePath = options.storagePath ?? defaultStoragePath();
  mkdirSync(dirname(sqlitePath), { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Elen({
    agentId: options.agentId,
    projectId: options.projectId,
    storage: 'sqlite' as const,
    sqlitePath
  } as any);
}

export async function routeToolCall(elen: Elen, agentId: string, name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case elenCommitTool.name:
      return handleCommit(elen, args);
    case elenSuggestTool.name:
      return handleSuggest(elen, args);
    case elenExpandTool.name:
      return handleExpand(elen, args);
    case elenSupersedeTool.name:
      return handleSupersede(elen, args);
    case elenGetCompetencyTool.name:
      return handleGetCompetency(elen, args, agentId);
    case elenGetContextTool.name:
      return handleGetContext(elen, args);
    case elenLogDecisionTool.name:
      return handleLogDecision(elen, args);
    case elenSearchPrecedentsTool.name:
      return handleSearchPrecedents(elen, args);
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
    tools: [
      elenCommitTool,
      elenSuggestTool,
      elenExpandTool,
      elenSupersedeTool,
      elenGetCompetencyTool,
      elenGetContextTool,
      elenLogDecisionTool,
      elenSearchPrecedentsTool
    ]
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
