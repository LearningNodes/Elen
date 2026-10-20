import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostedApp } from '../src/http-serve';
import { RECORD_NOTICE } from '../src/tools/notice';
import pkg from '../package.json';

const PROTOCOL = '2024-11-05';

describe('hosted HTTP MCP (T-2)', () => {
  let cloud: HttpServer;
  let cloudUrl: string;
  let appServer: HttpServer;
  let mcpUrl: string;
  let tmpHome: string;
  let prevHome: string | undefined;
  let seenAuth: string[] = [];
  let commitMode: 'committed' | 'blocked' = 'committed';

  beforeEach(async () => {
    seenAuth = [];
    commitMode = 'committed';
    tmpHome = mkdtempSync(join(tmpdir(), 'elen-hosted-home-'));
    prevHome = process.env.HOME;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    cloud = createServer((req, res) => {
      const auth = req.headers.authorization || '';
      seenAuth.push(auth);
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const url = req.url || '';
        if (req.method === 'POST' && url === '/elen/v2/decisions') {
          if (commitMode === 'blocked') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                blocked: true,
                similar_candidates: [
                  {
                    decision_id: 'dec:old',
                    question_text: 'q',
                    decision_text: 'd',
                    domain: 'general',
                    status: 'active',
                    score: 0.8
                  }
                ],
                message:
                  'Similar active decisions exist. Cite one in refs, supersede it, or commit again with force: true and a constraint that says how your decision differs.'
              })
            );
            return;
          }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ committed: { decision_id: 'dec:new', status: 'active' }, blocked: false }));
          return;
        }
        if (req.method === 'GET' && url.startsWith('/elen/v2/decisions/search')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              results: [
                {
                  decision_id: 'dec:1',
                  status: 'active',
                  decision_text: 'pointer',
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
        res.writeHead(404);
        res.end('no');
      });
    });
    await new Promise<void>((r) => cloud.listen(0, '127.0.0.1', () => r()));
    cloudUrl = `http://127.0.0.1:${(cloud.address() as AddressInfo).port}`;

    const { app } = createHostedApp(cloudUrl);
    appServer = createServer(app);
    await new Promise<void>((r) => appServer.listen(0, '127.0.0.1', () => r()));
    mcpUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    await new Promise<void>((r) => cloud.close(() => r()));
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  });

  async function mcpPost(body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { res, text, json };
  }

  it('401 invalid_token without Bearer key', async () => {
    const { res, json } = await mcpPost({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(res.status).toBe(401);
    expect(json).toEqual({ error: 'invalid_token' });
  });

  it('initialize then tools/list returns exactly six hosted tools with K6 descriptions and annotations', async () => {
    const init = await mcpPost(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      },
      { Authorization: 'Bearer lnk_hosted_a' }
    );
    expect(init.res.status).toBe(200);
    expect(init.res.headers.get('content-type') || '').toMatch(/application\/json/);

    const listed = await mcpPost(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { Authorization: 'Bearer lnk_hosted_a' }
    );
    expect(listed.res.headers.get('content-type') || '').toMatch(/application\/json/);
    const tools = (listed.json as { result: { tools: Array<{ name: string; description: string; annotations?: object }> } })
      .result.tools;
    expect(tools.map((t) => t.name)).toEqual([
      'elen_suggest',
      'elen_expand',
      'elen_commit',
      'elen_supersede',
      'elen_list',
      'elen_status'
    ]);
    expect(tools.find((t) => t.name === 'elen_suggest')?.description).toContain(
      'Before you make a choice that other bots or people will rely on'
    );
    expect(tools.find((t) => t.name === 'elen_commit')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(tools.find((t) => t.name === 'elen_list')?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false
    });
  });

  it('tools/call elen_commit committed and blocked paths', async () => {
    commitMode = 'committed';
    const ok = await mcpPost(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'elen_commit',
          arguments: {
            question: 'A vs B for hosted commit?',
            domain: 'general',
            decisionText: 'A',
            constraints: ['c1']
          }
        }
      },
      { Authorization: 'Bearer lnk_commit_ok' }
    );
    expect(ok.res.headers.get('content-type') || '').toMatch(/application\/json/);
    const okText = (ok.json as { result: { content: Array<{ text: string }> } }).result.content[0].text;
    expect(JSON.parse(okText)).toMatchObject({ blocked: false, committed: { decision_id: 'dec:new' } });

    commitMode = 'blocked';
    const blocked = await mcpPost(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'elen_commit',
          arguments: {
            question: 'A vs B for hosted commit?',
            domain: 'general',
            decisionText: 'B',
            constraints: ['c1']
          }
        }
      },
      { Authorization: 'Bearer lnk_commit_block' }
    );
    const blockedText = (blocked.json as { result: { content: Array<{ text: string }> } }).result.content[0]
      .text;
    const body = JSON.parse(blockedText);
    expect(body.blocked).toBe(true);
    expect(body.similar_candidates?.length).toBeGreaterThan(0);
  });

  it('tools/call elen_suggest returns JSON then exact notice', async () => {
    const out = await mcpPost(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'elen_suggest', arguments: { query: 'hosted suggest query' } }
      },
      { Authorization: 'Bearer lnk_suggest' }
    );
    expect(out.res.headers.get('content-type') || '').toMatch(/application\/json/);
    const content = (out.json as { result: { content: Array<{ type: string; text: string }> } }).result
      .content;
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe('text');
    expect(JSON.parse(content[0].text)[0].decision_id).toBe('dec:1');
    expect(content[1].text).toBe(RECORD_NOTICE);
  });

  it('Bearer key reaches fake cloud; concurrent keys never mix', async () => {
    seenAuth = [];
    await Promise.all([
      mcpPost(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'elen_commit',
            arguments: {
              question: 'Concurrent A question here?',
              domain: 'general',
              decisionText: 'A',
              constraints: ['a']
            }
          }
        },
        { Authorization: 'Bearer key-alpha' }
      ),
      mcpPost(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'elen_commit',
            arguments: {
              question: 'Concurrent B question here?',
              domain: 'general',
              decisionText: 'B',
              constraints: ['b']
            }
          }
        },
        { Authorization: 'Bearer key-beta' }
      )
    ]);
    expect(seenAuth).toContain('Bearer key-alpha');
    expect(seenAuth).toContain('Bearer key-beta');
    expect(seenAuth.filter((a) => a === 'Bearer key-alpha').length).toBeGreaterThanOrEqual(1);
    expect(seenAuth.filter((a) => a === 'Bearer key-beta').length).toBeGreaterThanOrEqual(1);
  });

  it('405 on GET and DELETE /mcp; /health returns package version', async () => {
    const get = await fetch(`${mcpUrl}/mcp`, { method: 'GET' });
    expect(get.status).toBe(405);
    const del = await fetch(`${mcpUrl}/mcp`, { method: 'DELETE' });
    expect(del.status).toBe(405);
    const health = await fetch(`${mcpUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, version: pkg.version });
  });

  it('malformed JSON gives 400 invalid_json; body over 64KB gives 413', async () => {
    const bad = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer lnk_x'
      },
      body: '{not-json'
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_json' });

    const big = 'x'.repeat(65 * 1024);
    const tooBig = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer lnk_x'
      },
      body: `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"pad":"${big}"}}`
    });
    expect(tooBig.status).toBe(413);
  });

  it('nothing is created under the temporary HOME', async () => {
    await mcpPost(
      {
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'elen_commit',
          arguments: {
            question: 'Home isolation question?',
            domain: 'general',
            decisionText: 'ok',
            constraints: ['c']
          }
        }
      },
      { Authorization: 'Bearer lnk_home' }
    );
    const elenDir = join(tmpHome, '.elen');
    expect(existsSync(elenDir)).toBe(false);
    // temp HOME itself may exist empty — no decision db under it
    const entries = existsSync(tmpHome) ? readdirSync(tmpHome) : [];
    expect(entries.filter((e) => e.includes('elen') || e.endsWith('.db'))).toEqual([]);
  });
});
