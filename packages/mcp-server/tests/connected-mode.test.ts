import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/server';
import { isCloudV2Storage } from '@learningnodes/elen';

describe('connected mode MCP (T-2)', () => {
  let cloud: HttpServer;
  let cloudUrl: string;
  let tmpDir: string;
  let dbPath: string;
  let lastHeaders: Record<string, string | string[] | undefined> = {};
  let lastBody: unknown = null;
  let seenPaths: string[] = [];

  beforeEach(async () => {
    lastHeaders = {};
    lastBody = null;
    seenPaths = [];
    tmpDir = mkdtempSync(join(tmpdir(), 'elen-connected-'));
    dbPath = join(tmpDir, 'decisions.db');

    cloud = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastHeaders = req.headers as Record<string, string | string[] | undefined>;
        const raw = Buffer.concat(chunks).toString('utf8');
        lastBody = raw ? JSON.parse(raw) : null;
        seenPaths.push(`${req.method} ${req.url}`);
        const url = req.url || '';

        if (req.method === 'GET' && url.startsWith('/elen/v2/decisions/search')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              results: [
                {
                  decision_id: 'dec:s1',
                  status: 'active',
                  decision_text: 's',
                  question_text: 'q',
                  constraint_set_id: 'cs:1',
                  refs: [],
                  supersedes_id: null,
                  score: 0.9
                }
              ]
            })
          );
          return;
        }
        if (req.method === 'GET' && /^\/elen\/v2\/decisions\/[^/?]+$/.test(url)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              record: {
                decision_id: 'dec:e1',
                q_id: 'q1',
                question_text: 'q',
                decision_text: 'd',
                status: 'active'
              },
              constraints: { constraint_set_id: 'cs:1', atoms: ['a'], summary: 'a' },
              history: []
            })
          );
          return;
        }
        if (req.method === 'GET' && url.startsWith('/elen/v2/decisions?')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ results: [], next_before: null }));
          return;
        }
        if (req.method === 'GET' && url === '/elen/v2/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              workspace: { id: 1, name: 'ws' },
              client: 'cursor',
              agents: [],
              totals: { active: 0, superseded: 0 }
            })
          );
          return;
        }
        if (req.method === 'POST' && url === '/elen/v2/decisions') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ committed: { decision_id: 'dec:c1' }, blocked: false }));
          return;
        }
        if (req.method === 'POST' && url.includes('/supersede')) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              committed: { decision_id: 'dec:c2' },
              blocked: false,
              superseded: 'dec:old'
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

  async function connectClient(clientName = 'Cursor IDE') {
    const { server, elen } = createMcpServer({
      agentId: 'connected-agent',
      connected: true,
      cloudUrl,
      userEmail: 'test@learningnodes.com',
      cloudApiKey: 'lnk_connected_test',
      storagePath: dbPath
    });

    const storage = elen.getStorage();
    if (isCloudV2Storage(storage)) {
      const local = (
        storage as unknown as {
          v2opts: {
            localFallback?: {
              saveRecord: (r: object) => Promise<void>;
              saveConstraintSet: (c: object) => Promise<void>;
            };
          };
        }
      ).v2opts.localFallback;
      if (local) {
        await local.saveConstraintSet({
          constraint_set_id: 'cs:local1',
          atoms: ['local basis'],
          summary: 'local'
        });
        await local.saveRecord({
          decision_id: 'dec:local1',
          q_id: 'q-local1',
          question_text: 'Local only context question for connected mode?',
          decision_text: 'stored locally before cloud tools',
          constraint_set_id: 'cs:local1',
          refs: [],
          status: 'active',
          timestamp: new Date().toISOString(),
          agent_id: 'connected-agent',
          domain: 'localdom'
        });
      }
    }

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: clientName, version: '1.0.0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, elen, server };
  }

  it('eight K6 tools reach the fake cloud', async () => {
    const { client, elen } = await connectClient('Cursor');
    seenPaths = [];

    await client.callTool({ name: 'elen_suggest', arguments: { query: 'cloud suggest query text' } });
    await client.callTool({ name: 'elen_search_precedents', arguments: { query: 'abc precedents query' } });
    await client.callTool({ name: 'elen_expand', arguments: { decisionId: 'dec:e1' } });
    await client.callTool({
      name: 'elen_commit',
      arguments: {
        question: 'Connected commit question?',
        domain: 'general',
        decisionText: 'yes',
        constraints: ['c']
      }
    });
    await client.callTool({
      name: 'elen_supersede',
      arguments: {
        oldDecisionId: 'dec:old',
        decisionText: 'new',
        constraints: ['c'],
        question: 'Connected supersede question?',
        domain: 'general'
      }
    });
    await client.callTool({ name: 'elen_list', arguments: { limit: 5 } });
    await client.callTool({ name: 'elen_status', arguments: {} });
    await client.callTool({
      name: 'elen_log_decision',
      arguments: {
        question: 'Log mapped to commit?',
        constraints: ['c'],
        evidence: ['e'],
        answer: 'mapped'
      }
    });

    const joined = seenPaths.join('\n');
    expect(joined).toMatch(/GET \/elen\/v2\/decisions\/search/);
    expect(joined).toMatch(/GET \/elen\/v2\/decisions\/dec(%3A|:)e1/);
    expect(joined).toMatch(/POST \/elen\/v2\/decisions/);
    expect(joined).toMatch(/supersede/);
    expect(joined).toMatch(/GET \/elen\/v2\/decisions\?/);
    expect(joined).toMatch(/GET \/elen\/v2\/status/);
    expect(seenPaths.filter((p) => p.startsWith('POST /elen/v2/decisions')).length).toBeGreaterThanOrEqual(2);

    elen.close();
    await client.close();
  });

  it('elen_get_context and elen_consolidate still read local data', async () => {
    const { client, elen } = await connectClient('Cursor');
    seenPaths = [];

    const ctx = await client.callTool({ name: 'elen_get_context', arguments: { domain: 'localdom' } });
    const cons = await client.callTool({ name: 'elen_consolidate', arguments: {} });

    expect(seenPaths.filter((p) => p.includes('/elen/v2')).length).toBe(0);
    const ctxText = (ctx.content as Array<{ text: string }>)[0].text;
    expect(ctxText.length).toBeGreaterThan(2);
    const consText = (cons.content as Array<{ text: string }>)[0].text;
    expect(consText).toMatch(/mode|suggest|clusters/i);

    elen.close();
    await client.close();
  });

  it('elen_log_decision maps answer to decisionText with domain default general', async () => {
    const { client, elen } = await connectClient('Cursor');
    lastBody = null;
    await client.callTool({
      name: 'elen_log_decision',
      arguments: {
        question: 'Should log map to commit?',
        constraints: ['mapped'],
        evidence: ['ev'],
        answer: 'the mapped decision text'
      }
    });
    expect(lastBody).toMatchObject({
      question: 'Should log map to commit?',
      decisionText: 'the mapped decision text',
      domain: 'general',
      evidence: ['ev'],
      constraints: ['mapped']
    });
    elen.close();
    await client.close();
  });

  it('X-Elen-Client comes from clientInfo.name', async () => {
    const { client, elen } = await connectClient('Cursor IDE App');
    lastHeaders = {};
    await client.callTool({ name: 'elen_status', arguments: {} });
    expect(String(lastHeaders['x-elen-client'] || '')).toBe('cursor-ide-app');
    elen.close();
    await client.close();
  });
});
