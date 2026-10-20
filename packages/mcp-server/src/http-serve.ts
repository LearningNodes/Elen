import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { Elen } from '@learningnodes/elen';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  elenCommitTool,
  elenSuggestTool,
  elenExpandTool,
  elenSupersedeTool,
  elenListTool,
  elenStatusTool,
  handleCommit,
  handleSuggest,
  handleExpand,
  handleSupersede,
  handleList,
  handleStatus,
  withNotice
} from './tools';
import { normalizeClientName } from './normalize-client';

// A10: notice on suggest/expand/list — not on status
const NOTICE_TOOLS = new Set(['elen_suggest', 'elen_expand', 'elen_list']);

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version || '0.4.0';
  } catch {
    return '0.4.0';
  }
}

/** Hosted mode: empty/missing X-MCP-Client → mcp-client (then K1 slug). */
function normalizeHostedClient(raw: string): string {
  const base = String(raw || '').trim() ? raw : 'mcp-client';
  const n = normalizeClientName(base);
  return n === 'api-key' && !String(raw || '').trim() ? 'mcp-client' : n;
}

function hostedTools() {
  return [elenSuggestTool, elenExpandTool, elenCommitTool, elenSupersedeTool, elenListTool, elenStatusTool];
}

async function routeHosted(elen: Elen, name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case 'elen_commit':
      return handleCommit(elen, args);
    case 'elen_suggest':
      return handleSuggest(elen, args);
    case 'elen_expand':
      return handleExpand(elen, args);
    case 'elen_supersede':
      return handleSupersede(elen, args);
    case 'elen_list':
      return handleList(elen, args);
    case 'elen_status':
      return handleStatus(elen);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Build the hosted Express app (no listen). Used by `serve --http` and tests.
 * Hosted mode labels clients via X-MCP-Client (not MCP clientInfo).
 */
export function createHostedApp(cloudUrl: string): { app: express.Express; version: string } {
  const version = packageVersion();
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, version });
  });

  app.get('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
  });
  app.delete('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
  });

  app.post('/mcp', async (req, res) => {
    const auth = req.headers.authorization || '';
    if (!auth.toLowerCase().startsWith('bearer ') || !auth.slice(7).trim()) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    const apiKey = auth.slice(7).trim();
    const clientName = normalizeHostedClient(String(req.headers['x-mcp-client'] || ''));

    const elen = new Elen({
      agentId: clientName,
      storage: 'cloud',
      apiUrl: cloudUrl,
      apiKey,
      clientName,
      cloudOnly: true,
      cloudV2: true
    });

    const server = new Server(
      { name: '@learningnodes/elen-mcp', version },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: hostedTools()
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const name = request.params.name;
        const result = await routeHosted(elen, name, request.params.arguments);
        if (NOTICE_TOOLS.has(name)) {
          return { content: withNotice(result) };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const error = (err as { error?: string }).error || 'tool_error';
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error, message }) }]
        };
      }
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    const cleanup = () => {
      void transport.close();
      const closable = server as unknown as { close?: () => Promise<void> };
      if (typeof closable.close === 'function') {
        void closable.close();
      }
    };
    res.on('close', cleanup);

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.use((err: { type?: string; status?: number; statusCode?: number; body?: unknown }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
      res.status(413).json({ error: 'body_too_large' });
      return;
    }
    if (err && (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400)) {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    next(err);
  });

  return { app, version };
}

/**
 * Hosted HTTP mode: `elen-mcp serve --http [--port N]`
 * Requires ELEN_CLOUD_URL (read in main). Stateless Streamable HTTP, JSON responses.
 */
export async function startHttpServe(port: number): Promise<void> {
  const cloudUrl = process.env.ELEN_CLOUD_URL;
  if (!cloudUrl) {
    console.error('ELEN_CLOUD_URL is required for hosted HTTP mode');
    process.exit(1);
  }

  const { app, version } = createHostedApp(cloudUrl);
  const httpServer = createServer(app);
  httpServer.listen(port, () => {
    console.error(`[elen-mcp] hosted HTTP listening on :${port} version=${version}`);
  });
}
