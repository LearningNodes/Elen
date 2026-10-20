import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/server';
import { createHostedApp } from '../src/http-serve';

const PROTOCOL = '2024-11-05';

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text: string }> }).content || [];
  return content[0]?.text || '';
}

describe('elen_supersede optional question/domain (TF-2)', () => {
  let cloud: HttpServer;
  let cloudUrl: string;
  let tmpDir: string;
  let dbPath: string;
  let supersedeBodies: Array<Record<string, unknown>> = [];

  beforeEach(async () => {
    supersedeBodies = [];
    tmpDir = mkdtempSync(join(tmpdir(), 'elen-supersede-'));
    dbPath = join(tmpDir, 'decisions.db');

    cloud = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const url = req.url || '';
        if (req.method === 'POST' && url.includes('/supersede')) {
          supersedeBodies.push(body);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              committed: { decision_id: 'dec:c2', status: 'active' },
              blocked: false,
              superseded: 'dec:old'
            })
          );
          return;
        }
        if (req.method === 'POST' && url === '/elen/v2/decisions') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ committed: { decision_id: 'dec:c1' }, blocked: false }));
          return;
        }
        if (req.method === 'GET' && url === '/elen/v2/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              workspace: { id: 1, name: 'ws' },
              client: 'x',
              agents: [],
              totals: { active: 0, superseded: 0 }
            })
          );
          return;
        }
        res.writeHead(404);
        res.end('missing');
      });
    });
    await new Promise<void>((r) => cloud.listen(0, '127.0.0.1', () => r()));
    cloudUrl = `http://127.0.0.1:${(cloud.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => cloud.close(() => r()));
  });

  async function connectStdio(opts: Parameters<typeof createMcpServer>[0], name = 'TestClient') {
    const { server, elen } = createMcpServer(opts);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, elen };
  }

  it('supersede with only oldDecisionId, decisionText and constraints works in local mode', async () => {
    const { client, elen } = await connectStdio({ agentId: 'local-agent', storagePath: dbPath });

    const tools = await client.listTools();
    const sup = tools.tools.find((t) => t.name === 'elen_supersede');
    expect(sup?.description).toMatch(/^Replace an active decision with a new one/);
    expect((sup?.inputSchema as { required?: string[] }).required).toEqual([
      'oldDecisionId',
      'decisionText',
      'constraints'
    ]);

    const committed = await client.callTool({
      name: 'elen_commit',
      arguments: {
        question: 'Local supersede original question?',
        domain: 'localdom',
        decisionText: 'original local decision',
        constraints: ['original basis']
      }
    });
    expect((committed as { isError?: boolean }).isError).toBeFalsy();
    const committedBody = JSON.parse(textOf(committed)) as {
      committed: { decision_id: string };
    };
    const oldId = committedBody.committed.decision_id;
    expect(oldId).toBeTruthy();

    const result = await client.callTool({
      name: 'elen_supersede',
      arguments: {
        oldDecisionId: oldId,
        decisionText: 'revised local decision',
        constraints: ['revised basis']
      }
    });
    expect((result as { isError?: boolean }).isError).toBeFalsy();
    const body = JSON.parse(textOf(result)) as {
      committed: { decision_id: string; question_text: string; domain: string; decision_text: string };
    };
    expect(body.committed.question_text).toBe('Local supersede original question?');
    expect(body.committed.domain).toBe('localdom');
    expect(body.committed.decision_text).toBe('revised local decision');

    elen.close();
    await client.close();
  });

  it('supersede without question/domain reaches the cloud without them in connected mode', async () => {
    const { client, elen } = await connectStdio({
      agentId: 'connected-agent',
      connected: true,
      cloudUrl,
      userEmail: 'test@learningnodes.com',
      cloudApiKey: 'lnk_connected_test',
      storagePath: dbPath
    });
    supersedeBodies = [];
    const result = await client.callTool({
      name: 'elen_supersede',
      arguments: {
        oldDecisionId: 'dec:old',
        decisionText: 'new connected decision',
        constraints: ['connected basis']
      }
    });
    expect((result as { isError?: boolean }).isError).toBeFalsy();
    expect(supersedeBodies).toHaveLength(1);
    expect(supersedeBodies[0]).toMatchObject({
      decisionText: 'new connected decision',
      constraints: ['connected basis']
    });
    expect(supersedeBodies[0]).not.toHaveProperty('question');
    expect(supersedeBodies[0]).not.toHaveProperty('domain');
    elen.close();
    await client.close();
  });

  it('supersede without question/domain reaches the cloud without them in hosted mode', async () => {
    const { app } = createHostedApp(cloudUrl);
    const appServer = createServer(app);
    await new Promise<void>((r) => appServer.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    try {
      supersedeBodies = [];
      const res = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer lnk_hosted_sup'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'elen_supersede',
            arguments: {
              oldDecisionId: 'dec:old',
              decisionText: 'new hosted decision',
              constraints: ['hosted basis']
            }
          }
        })
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
      expect(json.result.isError).toBeFalsy();
      expect(supersedeBodies).toHaveLength(1);
      expect(supersedeBodies[0]).not.toHaveProperty('question');
      expect(supersedeBodies[0]).not.toHaveProperty('domain');
    } finally {
      await new Promise<void>((r) => appServer.close(() => r()));
    }
  });

  it('missing required field gives invalid_input with a readable message in stdio mode', async () => {
    const { client, elen } = await connectStdio({ agentId: 'local-agent', storagePath: dbPath });
    const result = await client.callTool({
      name: 'elen_supersede',
      arguments: {
        oldDecisionId: 'dec:old',
        constraints: ['basis only']
      }
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { error: string; message: string };
    expect(body.error).toBe('invalid_input');
    expect(body.message).toMatch(/^decisionText: /);
    expect(body.message).not.toContain('"code"');
    expect(body.message).not.toContain('invalid_type');
    elen.close();
    await client.close();
  });

  it('missing required field gives invalid_input with a readable message in hosted mode', async () => {
    const { app } = createHostedApp(cloudUrl);
    const appServer = createServer(app);
    await new Promise<void>((r) => appServer.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer lnk_hosted_bad'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'elen_commit',
            arguments: {
              domain: 'general',
              decisionText: 'missing question',
              constraints: ['c']
            }
          }
        })
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
      expect(json.result.isError).toBe(true);
      const body = JSON.parse(json.result.content[0].text) as { error: string; message: string };
      expect(body.error).toBe('invalid_input');
      expect(body.message).toMatch(/^question: /);
      expect(body.message).not.toContain('"code"');
      // PROTOCOL constant referenced to keep hosted payloads aligned with existing tests
      expect(PROTOCOL).toBe('2024-11-05');
    } finally {
      await new Promise<void>((r) => appServer.close(() => r()));
    }
  });
});
