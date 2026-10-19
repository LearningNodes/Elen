import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Elen, resolveCredentials } from '@learningnodes/elen';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  elenCommitTool,
  elenSuggestTool,
  elenExpandTool,
  elenSupersedeTool,
  elenListTool,
  elenGetCompetencyTool,
  elenGetContextTool,
  elenLogDecisionTool,
  elenSearchPrecedentsTool,
  elenStatusTool,
  elenConsolidateTool,
  elenTeamSearchTool,
  elenIncomingTool,
  handleCommit,
  handleSuggest,
  handleExpand,
  handleSupersede,
  handleList,
  handleGetCompetency,
  handleGetContext,
  handleLogDecision,
  handleSearchPrecedents,
  handleStatus,
  handleConsolidate,
  handleTeamSearch,
  handleIncoming,
  withNotice
} from './tools';

// A10: notice on suggest/search_precedents/expand/list — not on status
const NOTICE_TOOLS = new Set(['elen_suggest', 'elen_expand', 'elen_list', 'elen_search_precedents']);

function mcpPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version || '0.4.0';
  } catch {
    return '0.4.0';
  }
}

export interface McpServerOptions {
  agentId: string;
  projectId?: string;
  storagePath?: string;
  /** LN-connected: commits go to cloud mcp_decisions (requires userEmail + cloudUrl). */
  connected?: boolean;
  cloudUrl?: string;
  userEmail?: string;
  cloudApiKey?: string;
}

export function defaultStoragePath(): string {
  return join(homedir(), '.elen', 'decisions.db');
}

export function createElenClient(options: McpServerOptions): Elen {
  const sqlitePath = options.storagePath ?? defaultStoragePath();
  mkdirSync(dirname(sqlitePath), { recursive: true });

  if (options.connected) {
    const creds = resolveCredentials();
    const cloudUrl = options.cloudUrl ?? creds.cloudUrl;
    const userEmail = options.userEmail ?? creds.userEmail;
    if (!cloudUrl || !userEmail) {
      throw new Error('Connected MCP mode requires ELEN_CLOUD_URL and ELEN_USER_EMAIL (or --cloud-url / --user-email)');
    }
    return new Elen({
      agentId: options.agentId,
      projectId: options.projectId,
      storage: 'cloud',
      apiUrl: cloudUrl,
      userEmail,
      apiKey: options.cloudApiKey ?? creds.apiKey,
      sqlitePath,
      cloudV2: true
    });
  }

  return new Elen({
    agentId: options.agentId,
    projectId: options.projectId,
    storage: 'sqlite',
    sqlitePath
  });
}

export async function routeToolCall(
  elen: Elen,
  agentId: string,
  name: string,
  args: unknown,
  dbPath?: string
): Promise<unknown> {
  switch (name) {
    case elenCommitTool.name:
      return handleCommit(elen, args);
    case elenSuggestTool.name:
      return handleSuggest(elen, args);
    case elenExpandTool.name:
      return handleExpand(elen, args);
    case elenListTool.name:
      return handleList(elen, args);
    case elenSupersedeTool.name:
      return handleSupersede(elen, args);
    case elenGetCompetencyTool.name:
      return handleGetCompetency(elen, args, agentId);
    case elenGetContextTool.name:
      return handleGetContext(elen, args);
    case elenStatusTool.name:
      return handleStatus(elen);
    case elenConsolidateTool.name:
      return handleConsolidate(elen, args, dbPath ?? defaultStoragePath());
    case elenLogDecisionTool.name:
      return handleLogDecision(elen, args);
    case elenSearchPrecedentsTool.name:
      return handleSearchPrecedents(elen, args);
    case elenTeamSearchTool.name:
      return handleTeamSearch(elen, args);
    case elenIncomingTool.name:
      return handleIncoming(elen, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function createMcpServer(options: McpServerOptions) {
  const sqlitePath = options.storagePath ?? defaultStoragePath();
  const elen = createElenClient(options);

  const server = new Server(
    {
      name: '@learningnodes/elen-mcp',
      version: mcpPackageVersion()
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
      elenListTool,
      elenGetCompetencyTool,
      elenGetContextTool,
      elenStatusTool,
      elenConsolidateTool,
      elenLogDecisionTool,
      elenSearchPrecedentsTool,
      elenTeamSearchTool,
      elenIncomingTool
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const result = await routeToolCall(
      elen,
      options.agentId,
      name,
      request.params.arguments,
      sqlitePath
    );

    if (NOTICE_TOOLS.has(name)) {
      return { content: withNotice(result) };
    }

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
