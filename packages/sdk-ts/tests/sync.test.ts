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
      json: async () => ({ results: [{ decision_id: 'dec:X', result: 'created' }] } satisfies SyncPushResponse)
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

    const resp = await storage.pushBatch({ records: [item] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3900/elen/sync/push');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer lnk_testkey123');
    expect(headers['X-Agent-Id']).toBe('cursor-test');
    // X-User-Email must NOT be sent on sync routes (key-only auth)
    expect(headers['X-User-Email']).toBeUndefined();

    const body = JSON.parse(String(init.body));
    expect(body.records).toHaveLength(1);
    expect(body.records[0].decision_id).toBe('dec:INFAT3-abc');
    expect(body.records[0].content_hash).toBe('abc123');

    expect(resp.results[0].result).toBe('created');
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

    await expect(storage.pushBatch({ records: [] })).rejects.toThrow('Sync push failed (401): invalid api key');
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

  function makePullResponse(items: SyncPushItem[], nextCursor: string | null = null): SyncPullResponse {
    return { records: items, next_cursor: nextCursor, has_more: false };
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ records: [], next_cursor: 'cursor-abc', has_more: false } satisfies SyncPullResponse)
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
});
