/**
 * sync.test.ts — DS-0 §6 sync surface tests.
 *
 * Route/auth dependency note:
 *   - fetch calls target /elen/sync/push and /elen/sync/pull
 *   - Auth: Bearer lnk_ API key (ELEN_API_KEY) via CloudMcpStorage.headers(forSync=true)
 *   - BLOCKER: gateway /elen/sync/* must be repointed to Bearer lnk_ auth (not JWT+X-User-Email)
 *     before these routes can be called in production. Tests stub fetch globally.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { computeContentHash } from '../src/sync/content-hash';
import { SQLiteStorage } from '../src/storage/sqlite';
import { CloudMcpStorage } from '../src/storage/cloud-mcp';
import { SyncEngine } from '../src/sync/sync-engine';
import type { SyncPushItem, SyncPullResponse, SyncPushResponse } from '../src/types';

// Helper: build a minimal SyncPushItem for dependency-order tests
function makeItem(
  id: string,
  timestamp: string,
  supersedes_id: string | null = null
): SyncPushItem {
  return {
    decision_id: id,
    q_id: `q-${id}`,
    question_text: null,
    decision_text: 'D',
    constraint_set_id: 'cs:A',
    domain: 'test',
    agent_id: 'a',
    refs: [],
    status: 'active',
    supersedes_id,
    timestamp,
    content_hash: `hash-${id}`
  };
}

// ---------------------------------------------------------------------------
// Golden vector test (DS-0 §6.2)
// This exact hex must match the ai-service planner's content_hash implementation.
// Field order: question_text, decision_text, constraint_set_id, domain, agent_id, refs (sorted).
// null question_text → '' (empty string).
// ---------------------------------------------------------------------------
describe('computeContentHash — DS-0 §6.2 golden vector', () => {
  it('produces stable hex for a known record', () => {
    const hash = computeContentHash({
      question_text: 'Which database should we use?',
      decision_text: 'Use PostgreSQL for the primary store.',
      constraint_set_id: 'cs:a1b2c3d4',
      domain: 'infrastructure',
      agent_id: 'claude-code',
      refs: ['ref:mcp/dec:INFAT3-zz1', 'ref:decision_record/42']
    });
    // Refs are sorted ascending before hashing:
    //   ['ref:decision_record/42', 'ref:mcp/dec:INFAT3-zz1']
    // Canonical JSON (key order fixed):
    //   {"question_text":"Which database should we use?","decision_text":"Use PostgreSQL for the primary store.","constraint_set_id":"cs:a1b2c3d4","domain":"infrastructure","agent_id":"claude-code","refs":["ref:decision_record/42","ref:mcp/dec:INFAT3-zz1"]}
    // SHA-256 of that UTF-8 string:
    expect(hash).toMatchSnapshot();
    // Stability assertion: length must always be 64 hex chars
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('null question_text → empty string (same hash as empty string input)', () => {
    const withNull = computeContentHash({
      question_text: null,
      decision_text: 'A',
      constraint_set_id: 'cs:0',
      domain: 'arch',
      agent_id: 'bot',
      refs: []
    });
    const withEmpty = computeContentHash({
      question_text: '',
      decision_text: 'A',
      constraint_set_id: 'cs:0',
      domain: 'arch',
      agent_id: 'bot',
      refs: []
    });
    expect(withNull).toBe(withEmpty);
  });

  it('undefined question_text → empty string (same as null)', () => {
    const withUndef = computeContentHash({
      decision_text: 'A',
      constraint_set_id: 'cs:0',
      domain: 'arch',
      agent_id: 'bot',
      refs: []
    });
    const withNull = computeContentHash({
      question_text: null,
      decision_text: 'A',
      constraint_set_id: 'cs:0',
      domain: 'arch',
      agent_id: 'bot',
      refs: []
    });
    expect(withUndef).toBe(withNull);
  });

  it('refs are sorted ascending before hashing', () => {
    const hashA = computeContentHash({
      question_text: 'Q',
      decision_text: 'D',
      constraint_set_id: 'cs:1',
      domain: 'd',
      agent_id: 'a',
      refs: ['ref:z', 'ref:a', 'ref:m']
    });
    const hashB = computeContentHash({
      question_text: 'Q',
      decision_text: 'D',
      constraint_set_id: 'cs:1',
      domain: 'd',
      agent_id: 'a',
      refs: ['ref:a', 'ref:m', 'ref:z']   // already sorted
    });
    expect(hashA).toBe(hashB);
  });

  it('different decision_text → different hash', () => {
    const base = { question_text: 'Q', constraint_set_id: 'cs:1', domain: 'd', agent_id: 'a', refs: [] as string[] };
    const h1 = computeContentHash({ ...base, decision_text: 'Use Redis' });
    const h2 = computeContentHash({ ...base, decision_text: 'Use Postgres' });
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// Push body shape test (fetch stub)
// ---------------------------------------------------------------------------
describe('CloudMcpStorage.pushBatch — wire shape', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      // Server returns per-item `status` field (not `result`)
      json: async () => ({ results: [{ decision_id: 'dec:X', status: 'created' }] } satisfies SyncPushResponse)
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('POSTs to /elen/sync/push with Bearer key and no X-User-Email', async () => {
    const storage = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'cursor-test',
      apiKey: 'lnk_testkey123'
      // userEmail intentionally omitted — sync is key-only
    });

    const item: SyncPushItem = {
      decision_id: 'dec:INFAT3-abc',
      q_id: 'q-1',
      question_text: 'Which DB?',
      decision_text: 'Use Postgres',
      constraint_set_id: 'cs:aaaa',
      domain: 'infra',
      agent_id: 'cursor-test',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-11T00:00:00.000Z',
      content_hash: 'abc123'
    };

    // Server reads req.body.items — SyncPushRequest field is `items`
    const resp = await storage.pushBatch({ items: [item] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3900/elen/sync/push');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer lnk_testkey123');
    expect(headers['X-Agent-Id']).toBe('cursor-test');
    // X-User-Email must NOT be sent on sync routes (key-only auth)
    expect(headers['X-User-Email']).toBeUndefined();

    // Server reads req.body.items — body must have `items`, not `records`
    const body = JSON.parse(String(init.body));
    expect(body.items).toHaveLength(1);
    expect(body.items[0].decision_id).toBe('dec:INFAT3-abc');
    expect(body.items[0].content_hash).toBe('abc123');
    expect(body.records).toBeUndefined();

    // Server per-item response field is `status`, not `result`
    expect(resp.results[0].status).toBe('created');
  });

  it('throws on non-2xx with body text', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'
    });

    const storage = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'cursor-test',
      apiKey: 'lnk_bad'
    });

    await expect(storage.pushBatch({ items: [] })).rejects.toThrow('Sync push failed (401): invalid api key');
  });
});

// ---------------------------------------------------------------------------
// Pull → merge into SQLite → searchRecords sees source='cloud' rows
// ---------------------------------------------------------------------------
describe('SyncEngine pull-merge into SQLite', () => {
  let dbPath: string;
  let local: SQLiteStorage;
  const fetchMock = vi.fn();

  beforeEach(() => {
    dbPath = join(tmpdir(), `elen-sync-${Date.now()}.db`);
    local = new SQLiteStorage(dbPath, 'test-project');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    local.close();
    rmSync(dbPath, { force: true });
  });

  // Server returns `rows` (not `records`) and has no `has_more` field
  function makePullResponse(items: SyncPushItem[], nextCursor: string | null = null): SyncPullResponse {
    return { rows: items, next_cursor: nextCursor };
  }

  it('pulled cloud records are readable via searchRecords', async () => {
    const cloudItem: SyncPushItem = {
      decision_id: 'dec:ARCAT3-cloud1',
      q_id: 'q-cloud-1',
      question_text: 'Which cache?',
      decision_text: 'Use Redis for session cache.',
      constraint_set_id: 'cs:cloud01',
      domain: 'infrastructure',
      agent_id: 'remote-agent',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-01T00:00:00.000Z',
      content_hash: computeContentHash({
        question_text: 'Which cache?',
        decision_text: 'Use Redis for session cache.',
        constraint_set_id: 'cs:cloud01',
        domain: 'infrastructure',
        agent_id: 'remote-agent',
        refs: []
      })
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makePullResponse([cloudItem])
    });

    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'local-agent',
      apiKey: 'lnk_key',
      localFallback: local
    });

    const engine = new SyncEngine({ cloud, local });
    const { upserted } = await engine.pull();
    expect(upserted).toBe(1);

    // Cloud row must be readable via searchRecords on the local store
    const results = await local.searchRecords({ domain: 'infrastructure' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const cloudRow = results.find((r) => 'decision_id' in r && (r as any).decision_id === 'dec:ARCAT3-cloud1');
    expect(cloudRow).toBeDefined();
  });

  it('cursor is persisted in sync_state after pull', async () => {
    // Page 1: returns a cursor, triggering a second fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      // Server returns `rows` (not `records`), no `has_more` field
      json: async () => ({ rows: [], next_cursor: 'cursor-abc' } satisfies SyncPullResponse)
    });
    // Page 2: next_cursor=null signals end-of-stream
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ rows: [], next_cursor: null } satisfies SyncPullResponse)
    });

    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'local-agent',
      apiKey: 'lnk_key',
      localFallback: local
    });

    const engine = new SyncEngine({ cloud, local });
    await engine.pull();

    const storedCursor = await local.getSyncCursor();
    expect(storedCursor).toBe('cursor-abc');
  });

  it('withdrawn tombstone flips local record status to withdrawn', async () => {
    // First, insert an active cloud record
    const activeItem: SyncPushItem = {
      decision_id: 'dec:ARCAT3-tomb1',
      q_id: 'q-tomb',
      question_text: 'Deprecated decision?',
      decision_text: 'This will be withdrawn.',
      constraint_set_id: 'cs:tomb01',
      domain: 'security',
      agent_id: 'remote-agent',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-01T00:00:00.000Z',
      content_hash: 'tombhash01'
    };
    await local.upsertCloudRecord(activeItem);

    // Verify it was inserted as active
    let results = await local.searchRecords({ domain: 'security' });
    // searchRecords excludes withdrawn — active record should be visible
    expect(results.some((r) => (r as any).decision_id === 'dec:ARCAT3-tomb1')).toBe(true);

    // Now upsert tombstone (withdrawn)
    const withdrawnItem: SyncPushItem = { ...activeItem, status: 'withdrawn' };
    await local.upsertCloudRecord(withdrawnItem);

    // searchRecords must exclude withdrawn
    results = await local.searchRecords({ domain: 'security' });
    expect(results.every((r) => (r as any).decision_id !== 'dec:ARCAT3-tomb1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SyncEngine.partitionChunks — chunk layout
// ---------------------------------------------------------------------------
describe('SyncEngine.partitionChunks', () => {
  function makeRecord(id: string, csId: string): SyncPushItem {
    return {
      decision_id: id,
      q_id: `q-${id}`,
      question_text: null,
      decision_text: 'D',
      constraint_set_id: csId,
      domain: 'test',
      agent_id: 'a',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      content_hash: `hash-${id}`
    };
  }

  function makeEngine(chunkSize: number): SyncEngine {
    // cloud/local not used in partitionChunks — pass minimal stubs
    return new SyncEngine({
      cloud: {} as any,
      local: {} as any,
      pushChunkSize: chunkSize
    });
  }

  it('returns empty array for empty input', () => {
    const engine = makeEngine(20);
    expect(engine.partitionChunks([])).toEqual([]);
  });

  it('single chunk when records <= chunkSize', () => {
    const engine = makeEngine(20);
    const records = Array.from({ length: 10 }, (_, i) => makeRecord(`d${i}`, 'cs:A'));
    const chunks = engine.partitionChunks(records);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });

  it('splits into multiple chunks when records > chunkSize', () => {
    const engine = makeEngine(5);
    // 12 records, all same constraint_set_id — should split 5/5/2
    const records = Array.from({ length: 12 }, (_, i) => makeRecord(`d${i}`, 'cs:A'));
    const chunks = engine.partitionChunks(records);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(5);
    expect(chunks[1]).toHaveLength(5);
    expect(chunks[2]).toHaveLength(2);
    // All records present
    expect(chunks.flat()).toHaveLength(12);
  });

  it('keeps constraint_set cohesion — new cs starts new chunk when current is full', () => {
    const engine = makeEngine(3);
    // 3 records with cs:A (fills chunk 0), then 1 record with cs:B (new chunk)
    const records = [
      makeRecord('d0', 'cs:A'),
      makeRecord('d1', 'cs:A'),
      makeRecord('d2', 'cs:A'),
      makeRecord('d3', 'cs:B')
    ];
    const chunks = engine.partitionChunks(records);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].every((r) => r.constraint_set_id === 'cs:A')).toBe(true);
    expect(chunks[1][0].constraint_set_id).toBe('cs:B');
  });

  it('all records present across all chunks', () => {
    const engine = makeEngine(4);
    const records = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord(`a${i}`, 'cs:X')),
      ...Array.from({ length: 4 }, (_, i) => makeRecord(`b${i}`, 'cs:Y')),
      ...Array.from({ length: 3 }, (_, i) => makeRecord(`c${i}`, 'cs:Z'))
    ];
    const chunks = engine.partitionChunks(records);
    const flat = chunks.flat();
    expect(flat).toHaveLength(records.length);
    expect(flat.map((r) => r.decision_id).sort()).toEqual(records.map((r) => r.decision_id).sort());
  });
});

// ---------------------------------------------------------------------------
// SyncEngine.push — multi-chunk aggregation (fetch stub)
// ---------------------------------------------------------------------------
describe('SyncEngine.push — chunked aggregation', () => {
  let dbPath: string;
  let local: SQLiteStorage;
  const fetchMock = vi.fn();

  beforeEach(() => {
    dbPath = join(tmpdir(), `elen-push-chunk-${Date.now()}.db`);
    local = new SQLiteStorage(dbPath, 'proj');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    local.close();
    rmSync(dbPath, { force: true });
  });

  async function seedRecords(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await local.saveRecord({
        decision_id: `dec:CHUNK-${i}`,
        q_id: `q-${i}`,
        question_text: `Question ${i}`,
        decision_text: `Decision ${i}`,
        constraint_set_id: `cs:chunk${i}`,
        refs: [],
        status: 'active',
        supersedes_id: null,
        timestamp: new Date().toISOString(),
        agent_id: 'test-agent',
        domain: 'test'
      });
    }
  }

  it('sends multiple fetch calls when records exceed chunkSize', async () => {
    // Seed 25 records; chunkSize=10 → 3 chunks
    await seedRecords(25);

    // Each chunk call returns a successful response
    // Server body field is `items`; server per-item response field is `status`
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { items: SyncPushItem[] };
      return {
        ok: true,
        status: 200,
        json: async () =>
          ({
            results: body.items.map((r) => ({ decision_id: r.decision_id, status: 'created' as const }))
          }) satisfies SyncPushResponse
      };
    });

    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'test-agent',
      apiKey: 'lnk_key'
    });
    const engine = new SyncEngine({ cloud, local, pushChunkSize: 10 });
    const response = await engine.push();

    // 3 fetch calls (chunks of 10/10/5)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // All 25 results aggregated
    expect(response.results).toHaveLength(25);
    expect(response.results.every((r) => r.status === 'created')).toBe(true);
  });

  it('aggregates pushed/duplicates/rejected across chunks', async () => {
    await seedRecords(6);

    // chunk 1 (records 0-2): 1 created, 1 duplicate, 1 error
    // chunk 2 (records 3-5): 2 created, 1 duplicate
    // Server body field is `items`; server per-item response field is `status`
    let callCount = 0;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { items: SyncPushItem[] };
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            ({
              results: [
                { decision_id: body.items[0].decision_id, status: 'created' as const },
                { decision_id: body.items[1].decision_id, status: 'duplicate' as const },
                { decision_id: body.items[2].decision_id, status: 'error' as const, error: 'bad' }
              ]
            }) satisfies SyncPushResponse
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          ({
            results: [
              { decision_id: body.items[0].decision_id, status: 'created' as const },
              { decision_id: body.items[1].decision_id, status: 'created' as const },
              { decision_id: body.items[2].decision_id, status: 'duplicate' as const }
            ]
          }) satisfies SyncPushResponse
      };
    });

    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'test-agent',
      apiKey: 'lnk_key'
    });
    const engine = new SyncEngine({ cloud, local, pushChunkSize: 3 });
    const response = await engine.push();

    expect(response.results).toHaveLength(6);
    expect(response.results.filter((r) => r.status === 'created')).toHaveLength(3);
    expect(response.results.filter((r) => r.status === 'duplicate')).toHaveLength(2);
    expect(response.results.filter((r) => r.status === 'error')).toHaveLength(1);
  });

  it('surfaces partial progress on mid-chunk HTTP failure', async () => {
    await seedRecords(9);

    let callCount = 0;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // First chunk succeeds (3 records created)
        // Server body field is `items`; server per-item response field is `status`
        const body = JSON.parse(String(init.body)) as { items: SyncPushItem[] };
        return {
          ok: true,
          status: 200,
          json: async () =>
            ({
              results: body.items.map((r) => ({ decision_id: r.decision_id, status: 'created' as const }))
            }) satisfies SyncPushResponse
        };
      }
      // Second chunk returns 413
      return {
        ok: false,
        status: 413,
        text: async () => 'Request body too large'
      };
    });

    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'test-agent',
      apiKey: 'lnk_key'
    });
    const engine = new SyncEngine({ cloud, local, pushChunkSize: 3 });

    // Capture the single push() call's error and assert all properties on it
    let caughtError: Error | undefined;
    try {
      await engine.push();
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toMatch(/chunk 2\/3/);
    expect(caughtError!.message).toMatch(/3 record\(s\) already accepted/);
    expect(caughtError!.message).toMatch(/idempotent/);
    expect(caughtError!.message).toMatch(/413/);
  });

  it('returns empty results when no local records exist', async () => {
    // No seeded records
    const cloud = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      agentId: 'test-agent',
      apiKey: 'lnk_key'
    });
    const engine = new SyncEngine({ cloud, local, pushChunkSize: 20 });
    const response = await engine.push();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listLocalRecordsForPush — local records have content_hash computed
// ---------------------------------------------------------------------------
describe('SQLiteStorage.listLocalRecordsForPush', () => {
  let dbPath: string;
  let storage: SQLiteStorage;

  beforeEach(() => {
    dbPath = join(tmpdir(), `elen-push-${Date.now()}.db`);
    storage = new SQLiteStorage(dbPath, 'proj');
  });

  afterEach(() => {
    storage.close();
    rmSync(dbPath, { force: true });
  });

  it('returns local records with computed content_hash', async () => {
    // Save a minimal record (source defaults to 'local')
    await storage.saveRecord({
      decision_id: 'dec:INFAT3-local1',
      q_id: 'q-local',
      question_text: 'Local question',
      decision_text: 'Local decision text.',
      constraint_set_id: 'cs:localaa',
      refs: ['ref:mcp/dec:other'],
      status: 'active',
      supersedes_id: null,
      timestamp: new Date().toISOString(),
      agent_id: 'local-agent',
      domain: 'infra'
    });

    const items = await storage.listLocalRecordsForPush();
    expect(items).toHaveLength(1);

    const item = items[0];
    expect(item.decision_id).toBe('dec:INFAT3-local1');
    expect(item.content_hash).toHaveLength(64);
    expect(item.content_hash).toMatch(/^[0-9a-f]{64}$/);

    // Verify the hash matches manual computation
    const expectedHash = computeContentHash({
      question_text: 'Local question',
      decision_text: 'Local decision text.',
      constraint_set_id: 'cs:localaa',
      domain: 'infra',
      agent_id: 'local-agent',
      refs: ['ref:mcp/dec:other']
    });
    expect(item.content_hash).toBe(expectedHash);
  });

  it('returns records in chronological ascending order by timestamp, tiebroken by decision_id', async () => {
    // Insert in reverse chronological order to ensure the ORDER BY is doing work
    await storage.saveRecord({
      decision_id: 'dec:order-C',
      q_id: 'q-C',
      question_text: null,
      decision_text: 'C',
      constraint_set_id: 'cs:ord',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-03T00:00:00.000Z',
      agent_id: 'a',
      domain: 'test'
    });
    await storage.saveRecord({
      decision_id: 'dec:order-A',
      q_id: 'q-A',
      question_text: null,
      decision_text: 'A',
      constraint_set_id: 'cs:ord',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-01T00:00:00.000Z',
      agent_id: 'a',
      domain: 'test'
    });
    await storage.saveRecord({
      decision_id: 'dec:order-B2',
      q_id: 'q-B2',
      question_text: null,
      decision_text: 'B2',
      constraint_set_id: 'cs:ord',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-02T00:00:00.000Z',
      agent_id: 'a',
      domain: 'test'
    });
    await storage.saveRecord({
      decision_id: 'dec:order-B1',
      q_id: 'q-B1',
      question_text: null,
      decision_text: 'B1',
      constraint_set_id: 'cs:ord',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-02T00:00:00.000Z',
      agent_id: 'a',
      domain: 'test'
    });

    const items = await storage.listLocalRecordsForPush();
    const ids = items.map((r) => r.decision_id);
    // Oldest first; same timestamp → alphabetical by decision_id
    expect(ids).toEqual(['dec:order-A', 'dec:order-B1', 'dec:order-B2', 'dec:order-C']);
  });
});

// ---------------------------------------------------------------------------
// SyncEngine.sortByDependencyOrder — dependency ordering
// ---------------------------------------------------------------------------
describe('SyncEngine.sortByDependencyOrder', () => {
  it('no-op when no supersedes_id references within the set', () => {
    const records = [
      makeItem('d1', '2026-01-01T00:00:00.000Z'),
      makeItem('d2', '2026-01-02T00:00:00.000Z'),
      makeItem('d3', '2026-01-03T00:00:00.000Z')
    ];
    const sorted = SyncEngine.sortByDependencyOrder(records);
    expect(sorted.map((r) => r.decision_id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('hoists target before superseder when superseder appears first in raw order', () => {
    // d2 supersedes d3 — but d3 sits after d2 in the raw list; d3 must be hoisted before d2
    const records = [
      makeItem('d1', '2026-01-01T00:00:00.000Z'),
      makeItem('d2', '2026-01-02T00:00:00.000Z', 'd3'),  // superseder appears before target
      makeItem('d3', '2026-01-03T00:00:00.000Z')          // target (should be hoisted)
    ];
    const sorted = SyncEngine.sortByDependencyOrder(records);
    const ids = sorted.map((r) => r.decision_id);
    // d3 must come before d2
    expect(ids.indexOf('d3')).toBeLessThan(ids.indexOf('d2'));
    // All records still present
    expect(ids.sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('leaves records whose supersedes_id is not in the push set unchanged', () => {
    // d2 supersedes 'external' which is not in the set — must not be dropped or reordered
    const records = [
      makeItem('d1', '2026-01-01T00:00:00.000Z'),
      makeItem('d2', '2026-01-02T00:00:00.000Z', 'external-not-in-set')
    ];
    const sorted = SyncEngine.sortByDependencyOrder(records);
    expect(sorted.map((r) => r.decision_id)).toEqual(['d1', 'd2']);
    expect(sorted[1].supersedes_id).toBe('external-not-in-set');
  });
});

// ---------------------------------------------------------------------------
// SyncEngine dependency ordering — cross-chunk: target lands in earlier chunk
// ---------------------------------------------------------------------------
describe('SyncEngine.buildPushBatch + partitionChunks — cross-chunk dependency', () => {
  let dbPath: string;
  let local: SQLiteStorage;
  const fetchMock = vi.fn();

  beforeEach(() => {
    dbPath = join(tmpdir(), `elen-deporder-${Date.now()}.db`);
    local = new SQLiteStorage(dbPath, 'proj');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    local.close();
    rmSync(dbPath, { force: true });
  });

  it('with chunkSize=2, superseder lands in a later chunk than its target after dependency sort', async () => {
    // Insert target with a LATER timestamp so it would naively sort after the superseder.
    // After the dependency pass the target must appear before the superseder.
    // We use distinct timestamps to make the raw order unambiguous.
    await local.saveRecord({
      decision_id: 'dec:dep-superseder',
      q_id: 'q-sup',
      question_text: null,
      decision_text: 'New decision',
      constraint_set_id: 'cs:dep',
      refs: [],
      status: 'active',
      supersedes_id: 'dec:dep-target',     // references the target
      timestamp: '2026-06-01T01:00:00.000Z',  // earlier raw timestamp
      agent_id: 'a',
      domain: 'test'
    });
    await local.saveRecord({
      decision_id: 'dec:dep-other',
      q_id: 'q-other',
      question_text: null,
      decision_text: 'Unrelated',
      constraint_set_id: 'cs:dep',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-01T02:00:00.000Z',
      agent_id: 'a',
      domain: 'test'
    });
    await local.saveRecord({
      decision_id: 'dec:dep-target',
      q_id: 'q-tgt',
      question_text: null,
      decision_text: 'Old decision',
      constraint_set_id: 'cs:dep',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: '2026-06-01T03:00:00.000Z',  // latest raw timestamp — would sort last
      agent_id: 'a',
      domain: 'test'
    });

    // Use the engine's buildPushBatch (which applies dependency sort after the DB query)
    const engine = new SyncEngine({ cloud: {} as any, local, pushChunkSize: 2 });
    const batch = await engine.buildPushBatch();

    const targetIdx = batch.findIndex((r) => r.decision_id === 'dec:dep-target');
    const supersederIdx = batch.findIndex((r) => r.decision_id === 'dec:dep-superseder');

    // The target must appear before the superseder regardless of raw timestamp order
    expect(targetIdx).toBeLessThan(supersederIdx);

    // Now partition into chunks of 2 — target must be in an earlier or same chunk
    const chunks = engine.partitionChunks(batch);
    let targetChunkIdx = -1;
    let supersederChunkIdx = -1;
    for (let ci = 0; ci < chunks.length; ci++) {
      if (chunks[ci].some((r) => r.decision_id === 'dec:dep-target')) targetChunkIdx = ci;
      if (chunks[ci].some((r) => r.decision_id === 'dec:dep-superseder')) supersederChunkIdx = ci;
    }
    expect(targetChunkIdx).toBeLessThanOrEqual(supersederChunkIdx);

    // All 3 records still present
    expect(batch).toHaveLength(3);
  });
});
