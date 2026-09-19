/**
 * claim.test.ts — tests for `elen claim` interactive flow.
 *
 * Strategy:
 *  - Stub global fetch for workspace lookup + push responses.
 *  - Inject a fake readline interface to control the consent prompt.
 *  - Use a real temp SQLite DB (via SQLiteStorage) so listLocalRecordsForPush
 *    exercises real code paths.
 *  - Use a temp config path so writeUserConfig does not touch ~/.elen/config.json.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage, readUserConfig } from '@learningnodes/elen';
import { runClaim } from '../src/claim';
import type { ClaimOptions } from '../src/claim';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeReadlineYes() {
  // Simulates the user typing "y\n"
  const stream = Readable.from(['y\n']);
  return createInterface({ input: stream, output: process.stdout, terminal: false });
}

function makeReadlineNo() {
  // Simulates the user pressing Enter (default = N)
  const stream = Readable.from(['\n']);
  return createInterface({ input: stream, output: process.stdout, terminal: false });
}

function makeReadlineAbort() {
  // Simulates the user typing "no"
  const stream = Readable.from(['no\n']);
  return createInterface({ input: stream, output: process.stdout, terminal: false });
}

/** Seed one real local record into SQLite so there is something to push. */
function seedRecord(storagePath: string, projectId: string) {
  const db = new SQLiteStorage(storagePath, projectId, 'open');
  // Insert via saveConstraintSet + saveRecord (both sync via better-sqlite3)
  db.saveConstraintSet({
    constraint_set_id: 'cs:test-001',
    atoms: ['Must be cheap', 'Must be fast'],
    summary: 'test constraints'
  } as any);
  db.saveRecord({
    decision_id: 'dec:test-001',
    q_id: 'q:test-001',
    agent_id: 'test-agent',
    domain: 'infrastructure',
    question_text: 'Which DB?',
    decision_text: 'Use PostgreSQL',
    constraint_set_id: 'cs:test-001',
    refs: [],
    status: 'active',
    supersedes_id: null,
    timestamp: new Date().toISOString()
  } as any);
  db.close();
}

// ---------------------------------------------------------------------------
// Mock workspace + push responses
// ---------------------------------------------------------------------------

const WORKSPACE_RESPONSE = {
  workspace_id: 'ws-abc123',
  workspace_name: 'learningnodes',
  record_count: 42
};

const PUSH_RESPONSE_CREATED = {
  results: [{ decision_id: 'dec:test-001', status: 'created' }]
};

const PUSH_RESPONSE_DUPLICATE = {
  results: [{ decision_id: 'dec:test-001', status: 'duplicate' }]
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runClaim', () => {
  let tmpDir: string;
  let storagePath: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('elen-claim-test');
    storagePath = join(tmpDir, 'decisions.db');
    configPath = join(tmpDir, 'config.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ── Test 1: declining consent pushes nothing ─────────────────────

  it('aborts without pushing when consent is declined (empty Enter)', async () => {
    seedRecord(storagePath, 'test-project');

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/elen/sync/workspace')) {
        return {
          ok: true,
          json: async () => WORKSPACE_RESPONSE
        } as Response;
      }
      // push should NOT be called
      throw new Error('push fetch called unexpectedly');
    });
    vi.stubGlobal('fetch', fetchMock);

    const rl = makeReadlineNo();
    const opts: ClaimOptions = {
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl
    };

    await runClaim(opts);

    // fetch called exactly once (workspace), push never called
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/elen/sync/workspace');

    // config must NOT be written
    const cfg = readUserConfig(configPath);
    expect(cfg).toBeNull();
  });

  it('aborts without pushing when user types "no"', async () => {
    seedRecord(storagePath, 'test-project');

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/elen/sync/workspace')) {
        return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
      }
      throw new Error('push fetch called unexpectedly');
    });
    vi.stubGlobal('fetch', fetchMock);

    const rl = makeReadlineAbort();
    await runClaim({
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readUserConfig(configPath)).toBeNull();
  });

  // ── Test 2: config written with claimed_projects on consent ──────

  it('writes claimed_projects to config when user consents', async () => {
    seedRecord(storagePath, 'test-project');

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/elen/sync/workspace')) {
        return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
      }
      if (String(url).includes('/elen/sync/push')) {
        return { ok: true, json: async () => PUSH_RESPONSE_CREATED } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rl = makeReadlineYes();
    await runClaim({
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl
    });

    const cfg = readUserConfig(configPath);
    expect(cfg).not.toBeNull();
    expect(cfg!.claimed_projects).toBeDefined();
    expect(cfg!.claimed_projects!['test-project']).toMatchObject({
      workspace_hint: 'learningnodes',
      api_key_prefix: expect.stringContaining('lnk_'),
      claimed_at: expect.any(String)
    });

    // claimed_at must be a valid ISO date string
    const claimedAt = cfg!.claimed_projects!['test-project'].claimed_at;
    expect(new Date(claimedAt).toISOString()).toBe(claimedAt);
  });

  // ── Test 3: push is called with consent ─────────────────────────

  it('calls push and returns summary with pushed count', async () => {
    seedRecord(storagePath, 'test-project');

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/elen/sync/workspace')) {
        return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
      }
      if (String(url).includes('/elen/sync/push')) {
        return { ok: true, json: async () => PUSH_RESPONSE_CREATED } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Capture stdout to verify summary
    const written: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    const rl = makeReadlineYes();
    await runClaim({
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl
    });

    vi.restoreAllMocks();

    const output = written.join('');
    expect(output).toContain('pushed');
    expect(output).toContain('duplicates');
    expect(output).toContain('learningnodes');
  });

  // ── Test 4: idempotent second run reports all duplicates ─────────

  it('reports all duplicates on a second claim run (idempotent)', async () => {
    seedRecord(storagePath, 'test-project');

    // First run: workspace + push (created)
    // Second run: workspace + push (duplicate)
    let callCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/elen/sync/workspace')) {
        return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
      }
      if (String(url).includes('/elen/sync/push')) {
        callCount += 1;
        const response = callCount === 1 ? PUSH_RESPONSE_CREATED : PUSH_RESPONSE_DUPLICATE;
        return { ok: true, json: async () => response } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // First run (consented)
    await runClaim({
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl: makeReadlineYes()
    });

    // Second run (consented)
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    await runClaim({
      projectId: 'test-project',
      storagePath,
      cloudUrl: 'http://localhost:3900',
      apiKey: 'lnk_testkey12345',
      configPath,
      rl: makeReadlineYes()
    });

    vi.restoreAllMocks();

    const output = written.join('');
    // Summary JSON must show 0 pushed, 1 duplicate
    expect(output).toContain('"pushed": 0');
    expect(output).toContain('"duplicates": 1');

    // Config must still have the claim entry (not duplicated/corrupted)
    const cfg = readUserConfig(configPath);
    const entries = Object.keys(cfg?.claimed_projects ?? {});
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe('test-project');
  });

  // ── Test 5: gateway error propagates cleanly ─────────────────────

  it('exits on workspace fetch failure', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error('process.exit called');
    });

    const rl = makeReadlineYes();
    await expect(
      runClaim({
        projectId: 'test-project',
        storagePath,
        cloudUrl: 'http://localhost:3900',
        apiKey: 'lnk_badkey',
        configPath,
        rl
      })
    ).rejects.toThrow('process.exit called');

    exitSpy.mockRestore();
    // config must not be written
    expect(readUserConfig(configPath)).toBeNull();
  });
});
