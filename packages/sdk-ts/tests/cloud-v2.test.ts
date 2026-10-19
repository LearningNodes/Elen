import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CloudV2Storage } from '../src/storage/cloud-v2';

describe('CloudV2Storage', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let last: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };

  beforeEach(async () => {
    last = {};
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        last.method = req.method;
        last.url = req.url;
        last.headers = req.headers as Record<string, string | string[] | undefined>;
        const raw = Buffer.concat(chunks).toString('utf8');
        last.body = raw ? JSON.parse(raw) : undefined;
        if (req.url?.startsWith('/elen/v2/decisions/search')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            results: [{
              decision_id: 'dec:1',
              status: 'active',
              decision_text: 'x',
              question_text: 'q',
              constraint_set_id: 'cs:1',
              refs: [],
              supersedes_id: null,
              score: 0.9
            }]
          }));
          return;
        }
        if (req.method === 'POST' && req.url === '/elen/v2/decisions') {
          const body = last.body as { force?: boolean };
          if (!body.force) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              blocked: true,
              similar_candidates: [{ decision_id: 'dec:old', score: 0.7 }],
              message: 'Similar active decisions exist. Cite one in refs, supersede it, or commit again with force: true and a constraint that says how your decision differs.'
            }));
            return;
          }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ committed: { decision_id: 'dec:new' }, blocked: false }));
          return;
        }
        res.writeHead(404);
        res.end('no');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('calls search with headers and maps pointers', async () => {
    const storage = new CloudV2Storage({
      apiUrl: baseUrl,
      apiKey: 'lnk_test',
      agentId: 'bot-a',
      clientName: 'cursor',
      cloudOnly: true
    });
    const results = await storage.searchV2({ query: 'hello world', domain: 'pricing', limit: 3 });
    expect(last.method).toBe('GET');
    expect(last.url).toContain('/elen/v2/decisions/search?');
    expect(last.url).toContain('q=hello');
    expect(last.headers?.authorization).toBe('Bearer lnk_test');
    expect(last.headers?.['x-agent-id']).toBe('bot-a');
    expect(last.headers?.['x-elen-client']).toBe('cursor');
    expect(results[0].decision_id).toBe('dec:1');
    expect((results[0] as { score?: number }).score).toBe(0.9);
  });

  it('passes blocked commit through unchanged', async () => {
    const storage = new CloudV2Storage({
      apiUrl: baseUrl,
      apiKey: 'lnk_test',
      agentId: 'bot-a',
      cloudOnly: true
    });
    const result = await storage.commitV2({
      question: 'A vs B for C',
      domain: 'pricing',
      decisionText: 'A',
      constraints: ['x']
    });
    expect(result.blocked).toBe(true);
    expect(last.method).toBe('POST');
    expect(last.url).toBe('/elen/v2/decisions');
  });

  it('surfaces network errors without local write', async () => {
    const storage = new CloudV2Storage({
      apiUrl: 'http://127.0.0.1:1',
      apiKey: 'lnk_test',
      agentId: 'bot-a',
      cloudOnly: true
    });
    await expect(
      storage.commitV2({
        question: 'A vs B for C',
        domain: 'pricing',
        decisionText: 'A',
        constraints: ['x']
      })
    ).rejects.toThrow(/unreachable|Elen cloud/i);
  });
});
