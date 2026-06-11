/**
 * compat.test.ts — SQLiteStorage backward-compatibility tests.
 *
 * Constructs "old-shaped" databases by hand via better-sqlite3 and then opens
 * them with the current SQLiteStorage implementation.  Asserts that:
 *   1. Reads succeed (rows are returned via searchRecords / getRecord).
 *   2. Migration sets PRAGMA user_version to the current target (2).
 *   3. Rows survive the migration with their payload intact.
 *
 * Three fixture shapes are tested:
 *   - v0.1.6 shape: has `record_json` column, no `payload_json`, no `user_version`.
 *   - v0.1.7 shape: has `payload_json` column, no `user_version` (user_version = 0).
 *   - current shape: already at user_version 2 (fast path — no migration).
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../src/storage/sqlite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDb(): string {
  return join(tmpdir(), `elen-compat-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

/** Build a minimal v0.1.6-shaped DB (record_json column, no payload_json, no user_version). */
function buildV016Db(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE constraint_sets (constraint_set_id TEXT PRIMARY KEY, atoms TEXT NOT NULL, summary TEXT NOT NULL);
    CREATE TABLE decisions (decision_id TEXT PRIMARY KEY, decision_json TEXT NOT NULL);
    CREATE TABLE search_log (search_id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, domain TEXT, project_id TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, cross_project_hits INTEGER NOT NULL DEFAULT 0, searched_at TEXT NOT NULL);
    CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE records (
      record_id         TEXT PRIMARY KEY,
      decision_id       TEXT NOT NULL,
      q_id              TEXT NOT NULL DEFAULT '',
      agent_id          TEXT NOT NULL,
      domain            TEXT NOT NULL,
      project_id        TEXT NOT NULL DEFAULT 'default',
      question_text     TEXT,
      decision_text     TEXT NOT NULL,
      constraint_set_id TEXT NOT NULL DEFAULT '',
      refs              TEXT NOT NULL DEFAULT '[]',
      status            TEXT NOT NULL DEFAULT 'active',
      supersedes_id     TEXT,
      timestamp         TEXT NOT NULL,
      record_json       TEXT
    );
  `);
  // Insert a sample row
  const payload = JSON.stringify({
    record_id: 'rec-016-1',
    decision_id: 'dec-016-1',
    question_text: 'Which cache should we use?',
    decision_text: 'Use Redis.',
    domain: 'infra',
    agent_id: 'agent-016',
    status: 'active',
    timestamp: '2025-01-01T00:00:00.000Z',
  });
  db.prepare(`
    INSERT INTO records (record_id, decision_id, q_id, agent_id, domain, project_id,
      question_text, decision_text, constraint_set_id, refs, status, timestamp, record_json)
    VALUES (?, ?, '', ?, ?, 'default', ?, ?, '', '[]', 'active', ?, ?)
  `).run('rec-016-1', 'dec-016-1', 'agent-016', 'infra', 'Which cache should we use?', 'Use Redis.', '2025-01-01T00:00:00.000Z', payload);
  db.close();
}

/** Build a v0.1.7-shaped DB (payload_json column present, user_version = 0). */
function buildV017Db(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE constraint_sets (constraint_set_id TEXT PRIMARY KEY, atoms TEXT NOT NULL, summary TEXT NOT NULL);
    CREATE TABLE decisions (decision_id TEXT PRIMARY KEY, decision_json TEXT NOT NULL);
    CREATE TABLE search_log (search_id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, domain TEXT, project_id TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, cross_project_hits INTEGER NOT NULL DEFAULT 0, searched_at TEXT NOT NULL);
    CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE records (
      record_id         TEXT PRIMARY KEY,
      decision_id       TEXT NOT NULL,
      q_id              TEXT NOT NULL DEFAULT '',
      agent_id          TEXT NOT NULL,
      domain            TEXT NOT NULL,
      project_id        TEXT NOT NULL DEFAULT 'default',
      question_text     TEXT,
      decision_text     TEXT NOT NULL,
      constraint_set_id TEXT NOT NULL DEFAULT '',
      refs              TEXT NOT NULL DEFAULT '[]',
      status            TEXT NOT NULL DEFAULT 'active',
      supersedes_id     TEXT,
      timestamp         TEXT NOT NULL,
      payload_json      TEXT
    );
  `);
  // user_version deliberately left at 0 (default)
  const payload = JSON.stringify({
    decision_id: 'dec-017-1',
    q_id: 'q-017-1',
    question_text: 'Which DB for writes?',
    decision_text: 'Use Postgres.',
    domain: 'data',
    agent_id: 'agent-017',
    status: 'active',
    timestamp: '2025-06-01T00:00:00.000Z',
  });
  db.prepare(`
    INSERT INTO records (record_id, decision_id, q_id, agent_id, domain, project_id,
      question_text, decision_text, constraint_set_id, refs, status, timestamp, payload_json)
    VALUES (?, ?, ?, ?, ?, 'default', ?, ?, '', '[]', 'active', ?, ?)
  `).run('dec-017-1', 'dec-017-1', 'q-017-1', 'agent-017', 'data', 'Which DB for writes?', 'Use Postgres.', '2025-06-01T00:00:00.000Z', payload);
  db.close();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SQLiteStorage — backward compat: v0.1.6 DB (record_json, no user_version)', () => {
  let dbPath: string;
  let storage: SQLiteStorage;

  beforeEach(() => {
    dbPath = tmpDb();
    buildV016Db(dbPath);
    storage = new SQLiteStorage(dbPath, 'default');
  });

  afterEach(() => {
    storage.close();
    rmSync(dbPath, { force: true });
  });

  it('opens without throwing', () => {
    expect(storage).toBeDefined();
  });

  it('sets user_version to 2 after migration', () => {
    const raw = new BetterSqlite3(dbPath, { readonly: true });
    const version = (raw as any).pragma('user_version', { simple: true }) as number;
    raw.close();
    expect(version).toBe(2);
  });

  it('migrated row is readable via searchRecords', async () => {
    const results = await storage.searchRecords({ domain: 'infra' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const row = results[0] as any;
    expect(row.decision_id ?? row.record_id).toBe('dec-016-1');
    // Payload content survives migration
    expect(row.decision_text ?? row.answer).toMatch(/Redis/);
  });

  it('migrated row is readable via getRecord', async () => {
    const record = await storage.getRecord('rec-016-1');
    expect(record).not.toBeNull();
  });
});

describe('SQLiteStorage — backward compat: v0.1.7 DB (payload_json, user_version=0)', () => {
  let dbPath: string;
  let storage: SQLiteStorage;

  beforeEach(() => {
    dbPath = tmpDb();
    buildV017Db(dbPath);
    storage = new SQLiteStorage(dbPath, 'default');
  });

  afterEach(() => {
    storage.close();
    rmSync(dbPath, { force: true });
  });

  it('opens without throwing', () => {
    expect(storage).toBeDefined();
  });

  it('sets user_version to 2 after migration', () => {
    const raw = new BetterSqlite3(dbPath, { readonly: true });
    const version = (raw as any).pragma('user_version', { simple: true }) as number;
    raw.close();
    expect(version).toBe(2);
  });

  it('existing row survives migration and is readable via searchRecords', async () => {
    const results = await storage.searchRecords({ domain: 'data' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const row = results[0] as any;
    expect(row.decision_id).toBe('dec-017-1');
    expect(row.decision_text).toMatch(/Postgres/);
  });

  it('existing row is readable via getRecord by decision_id', async () => {
    const record = await storage.getRecord('dec-017-1');
    expect(record).not.toBeNull();
  });
});

describe('SQLiteStorage — current schema (fresh DB)', () => {
  let dbPath: string;
  let storage: SQLiteStorage;

  beforeEach(() => {
    dbPath = tmpDb();
    storage = new SQLiteStorage(dbPath, 'default');
  });

  afterEach(() => {
    storage.close();
    rmSync(dbPath, { force: true });
  });

  it('fresh DB is created at user_version 2', () => {
    const raw = new BetterSqlite3(dbPath, { readonly: true });
    const version = (raw as any).pragma('user_version', { simple: true }) as number;
    raw.close();
    expect(version).toBe(2);
  });

  it('re-opening a current-schema DB does not change user_version', async () => {
    // Write a record and close
    await storage.saveRecord({
      decision_id: 'dec-current-1',
      q_id: 'q-1',
      question_text: 'Fast path test?',
      decision_text: 'Yes.',
      constraint_set_id: 'cs:0',
      domain: 'test',
      agent_id: 'agent-test',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: new Date().toISOString(),
    });
    storage.close();

    // Re-open with a new instance (fast path — no migration needed)
    const storage2 = new SQLiteStorage(dbPath, 'default');
    const results = await storage2.searchRecords({ domain: 'test' });
    expect(results.length).toBe(1);

    const raw = new BetterSqlite3(dbPath, { readonly: true });
    const version = (raw as any).pragma('user_version', { simple: true }) as number;
    raw.close();
    expect(version).toBe(2);

    storage2.close();
  });
});
