import type Database from 'better-sqlite3';
import type { CompetencyProfile, ConstraintSet, DecisionContext, DecisionRecord, MinimalDecisionRecord } from '@learningnodes/elen-core';
import { backupDatabase, exportDatabase, importDatabase, type ExportBundle } from '../admin';
import { buildGraphMeta } from '../graph-meta';
import { cosineSimilarity } from '../similarity';
import { openSqliteDatabase } from '../sqlite-open';
import type { GraphMeta, GraphStats, SearchOptions, SyncPushItem } from '../types';
import type { StorageAdapter } from './interface';

export class SQLiteStorage implements StorageAdapter {
  private readonly db: Database.Database;
  private readonly dbPath: string;
  private readonly projectId: string;
  private readonly defaultIsolation: 'strict' | 'open';

  constructor(path: string, projectId: string = 'default', defaultIsolation: 'strict' | 'open' = 'strict') {
    this.dbPath = path;
    this.db = openSqliteDatabase(path);
    this.projectId = projectId;
    this.defaultIsolation = defaultIsolation;
    this.init();
  }

  getPath(): string {
    return this.dbPath;
  }

  getProjectId(): string {
    return this.projectId;
  }

  listRecordRows(): Array<{
    project_id: string;
    status: string;
    agent_id: string;
    question_text: string | null;
    decision_text: string;
    domain: string;
    decision_id: string;
  }> {
    return this.db
      .prepare(
        `SELECT project_id, status, agent_id, question_text, decision_text, domain, decision_id
         FROM records WHERE status != 'withdrawn'`
      )
      .all() as Array<{
      project_id: string;
      status: string;
      agent_id: string;
      question_text: string | null;
      decision_text: string;
      domain: string;
      decision_id: string;
    }>;
  }

  getGraphMeta(agentId: string): GraphMeta {
    return buildGraphMeta(this.dbPath, agentId, this.projectId, this.listRecordRows());
  }

  renameProject(oldId: string, newId: string): { records: number; search_log: number } {
    const r1 = this.db.prepare('UPDATE records SET project_id = ? WHERE project_id = ?').run(newId, oldId);
    const r2 = this.db.prepare('UPDATE search_log SET project_id = ? WHERE project_id = ?').run(newId, oldId);
    return { records: r1.changes, search_log: r2.changes };
  }

  mergeProjects(sourceIds: string[], destId: string): { records: number; search_log: number } {
    let records = 0;
    let search_log = 0;
    for (const src of sourceIds) {
      if (src === destId) continue;
      const r = this.renameProject(src, destId);
      records += r.records;
      search_log += r.search_log;
    }
    return { records, search_log };
  }

  pruneBlank(projectFilter?: string): { removed: number } {
    let query = `DELETE FROM records WHERE (
      question_text IS NULL OR trim(question_text) = ''
    ) AND (
      decision_text IS NULL OR trim(decision_text) = ''
    )`;
    const params: string[] = [];
    if (projectFilter) {
      query += ' AND project_id = ?';
      params.push(projectFilter);
    }
    const result = this.db.prepare(query).run(...params);
    return { removed: result.changes };
  }

  backup(destPath?: string): string {
    return backupDatabase(this.dbPath, destPath);
  }

  exportJson(): ExportBundle {
    return exportDatabase(this.db);
  }

  importJson(bundle: ExportBundle): { records: number } {
    return importDatabase(this.db, bundle);
  }

  getStats(agentId: string): GraphStats {
    const meta = this.getGraphMeta(agentId);
    const agents = this.db
      .prepare(
        `SELECT agent_id, COUNT(*) AS count FROM records
         WHERE project_id = ? GROUP BY agent_id ORDER BY count DESC`
      )
      .all(this.projectId) as Array<{ agent_id: string; count: number }>;

    const activeRows = this.listRecordRows().filter(
      (r) => r.project_id === this.projectId && r.status === 'active'
    );
    const duplicate_candidates: GraphStats['duplicate_candidates'] = [];
    for (let i = 0; i < activeRows.length; i += 1) {
      for (let j = i + 1; j < activeRows.length; j += 1) {
        const a = activeRows[i];
        const b = activeRows[j];
        const corpusA = `${a.question_text ?? ''} ${a.decision_text}`;
        const corpusB = `${b.question_text ?? ''} ${b.decision_text}`;
        const score = cosineSimilarity(corpusA, corpusB);
        if (score >= 0.65) {
          duplicate_candidates.push({
            decision_ids: [a.decision_id, b.decision_id],
            score
          });
        }
      }
    }

    return { ...meta, agents, duplicate_candidates };
  }

  close(): void {
    this.db.close();
  }

  listActiveForSimilarity(): Array<{
    decision_id: string;
    question_text?: string;
    decision_text: string;
    domain: string;
    status: string;
  }> {
    return this.listRecordRows()
      .filter((r) => r.project_id === this.projectId && r.status === 'active')
      .map((r) => ({
        decision_id: r.decision_id,
        question_text: r.question_text ?? undefined,
        decision_text: r.decision_text,
        domain: r.domain,
        status: r.status
      }));
  }

  // Target schema version tracked via PRAGMA user_version.
  // 0 = pre-versioning (old DBs); 2 = current (payload_json + source columns present).
  private static readonly SCHEMA_VERSION = 2;

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS constraint_sets (constraint_set_id TEXT PRIMARY KEY, atoms TEXT NOT NULL, summary TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (decision_id TEXT PRIMARY KEY, decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS search_log (search_id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, domain TEXT, project_id TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, cross_project_hits INTEGER NOT NULL DEFAULT 0, searched_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);

    // Read the current schema version
    const userVersion = ((this.db as any).pragma('user_version', { simple: true }) as number) ?? 0;

    // Check if records table exists and what schema it has
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get();

    if (!tableExists) {
      // Fresh DB: create spec-compliant table including source column for sync
      this.db.exec(`
        CREATE TABLE records (
          record_id         TEXT PRIMARY KEY,
          decision_id       TEXT NOT NULL,
          q_id              TEXT NOT NULL,
          agent_id          TEXT NOT NULL,
          domain            TEXT NOT NULL,
          project_id        TEXT NOT NULL DEFAULT 'default',
          question_text     TEXT,
          decision_text     TEXT NOT NULL,
          constraint_set_id TEXT NOT NULL,
          refs              TEXT NOT NULL DEFAULT '[]',
          status            TEXT NOT NULL DEFAULT 'active',
          supersedes_id     TEXT,
          timestamp         TEXT NOT NULL,
          payload_json      TEXT,
          source            TEXT NOT NULL DEFAULT 'local'
        );
      `);
      // Set schema version directly on fresh DB
      (this.db as any).pragma(`user_version = ${SQLiteStorage.SCHEMA_VERSION}`);
      return;
    }

    // Table exists — if version is already current, skip migration checks
    if (userVersion >= SQLiteStorage.SCHEMA_VERSION) {
      return;
    }

    // user_version = 0: old DB — run column-sniff migration path
    const cols = (this.db as any).pragma('table_info(records)') as Array<{ name: string }>;
    const colNames = new Set(cols.map(c => c.name));

    const needsRebuild = colNames.has('record_json') || !colNames.has('payload_json');

    if (needsRebuild) {
      // Old schema detected — rebuild table to fix NOT NULL constraints
      this.db.exec('BEGIN TRANSACTION');
      try {
        this.db.exec('ALTER TABLE records RENAME TO _records_old');
        this.db.exec(`
          CREATE TABLE records (
            record_id         TEXT PRIMARY KEY,
            decision_id       TEXT NOT NULL,
            q_id              TEXT NOT NULL,
            agent_id          TEXT NOT NULL,
            domain            TEXT NOT NULL,
            project_id        TEXT NOT NULL DEFAULT 'default',
            question_text     TEXT,
            decision_text     TEXT NOT NULL,
            constraint_set_id TEXT NOT NULL,
            refs              TEXT NOT NULL DEFAULT '[]',
            status            TEXT NOT NULL DEFAULT 'active',
            supersedes_id     TEXT,
            timestamp         TEXT NOT NULL,
            payload_json      TEXT,
            source            TEXT NOT NULL DEFAULT 'local'
          );
        `);

        // Copy data, mapping old columns to new
        const hasRecordJson = colNames.has('record_json');
        const hasQuestionText = colNames.has('question_text');
        const payloadCol = hasRecordJson ? 'record_json' : (colNames.has('payload_json') ? 'payload_json' : 'NULL');
        const questionCol = hasQuestionText ? 'question_text' : 'NULL';

        this.db.exec(`
          INSERT INTO records (
            record_id, decision_id, q_id, agent_id, domain, project_id,
            question_text, decision_text, constraint_set_id,
            refs, status, supersedes_id, timestamp, payload_json
          )
          SELECT
            record_id, decision_id, q_id, agent_id, domain, project_id,
            ${questionCol}, decision_text, constraint_set_id,
            refs, status, supersedes_id, timestamp, ${payloadCol}
          FROM _records_old
        `);

        this.db.exec('DROP TABLE _records_old');
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    } else if (!colNames.has('question_text')) {
      // Partial migration: just add missing columns
      this.db.exec('ALTER TABLE records ADD COLUMN question_text TEXT');
    }

    // Additive: source column for sync (column-sniff only — never triggers rebuild)
    const colsAfter = (this.db as any).pragma('table_info(records)') as Array<{ name: string }>;
    const colNamesAfter = new Set(colsAfter.map((c: { name: string }) => c.name));
    if (!colNamesAfter.has('source')) {
      this.db.exec("ALTER TABLE records ADD COLUMN source TEXT NOT NULL DEFAULT 'local'");
    }

    // Mark schema version after all migrations complete
    (this.db as any).pragma(`user_version = ${SQLiteStorage.SCHEMA_VERSION}`);
  }


  /* ── Decisions (context objects) ──────────────────── */

  async saveDecision(decision: DecisionContext): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO decisions(decision_id, decision_json) VALUES (?,?)').run([decision.decision_id, JSON.stringify(decision)]);
  }

  /* ── Constraint Sets ─────────────────────────────── */

  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO constraint_sets(constraint_set_id, atoms, summary) VALUES (?,?,?)').run([constraintSet.constraint_set_id, JSON.stringify(constraintSet.atoms), constraintSet.summary]);
  }
  async getConstraintSet(id: string): Promise<ConstraintSet | null> {
    const row = this.db.prepare('SELECT * FROM constraint_sets WHERE constraint_set_id=?').get(id) as any;
    return row ? { constraint_set_id: row.constraint_set_id, atoms: JSON.parse(row.atoms), summary: row.summary } : null;
  }

  /* ── Records ─────────────────────────────────────── */

  async saveRecord(record: MinimalDecisionRecord | DecisionRecord): Promise<void> {
    if ("record_id" in record) {
      await this.saveLegacyRecord(record);
      return;
    }
    // Spec-compliant MinimalDecisionRecord — all columns populated
    this.db.prepare(`
      INSERT OR REPLACE INTO records(
        record_id, decision_id, q_id, agent_id, domain, project_id,
        question_text, decision_text, constraint_set_id,
        refs, status, supersedes_id, timestamp, payload_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run([
      record.decision_id,          // record_id = decision_id for minimal records
      record.decision_id,
      record.q_id,
      record.agent_id,
      record.domain,
      this.projectId,
      record.question_text ?? null,
      record.decision_text,
      record.constraint_set_id,
      JSON.stringify(record.refs),
      record.status,
      record.supersedes_id ?? null,
      record.timestamp,
      JSON.stringify(record)
    ]);
  }

  async saveLegacyRecord(record: DecisionRecord): Promise<void> {
    // Legacy DecisionRecord (v0) — map old fields to spec columns
    this.db.prepare(`
      INSERT OR REPLACE INTO records(
        record_id, decision_id, q_id, agent_id, domain, project_id,
        question_text, decision_text, constraint_set_id,
        refs, status, supersedes_id, timestamp, payload_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run([
      record.record_id,
      record.decision_id,
      '',                            // q_id not available in legacy format
      record.agent_id,
      record.domain,
      this.projectId,
      record.question,               // question → question_text
      record.answer,                 // answer → decision_text
      '',                            // no constraint_set_id in legacy
      JSON.stringify([]),             // no refs in legacy
      'active',                      // default status
      null,                          // no supersedes_id in legacy
      record.published_at,           // published_at → timestamp
      JSON.stringify(record)
    ]);
  }

  async getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null> {
    const row = this.db.prepare('SELECT payload_json FROM records WHERE record_id=? OR decision_id=?').get([recordId, recordId]) as any;
    return row?.payload_json ? JSON.parse(row.payload_json) : null;
  }

  /* ── Search ──────────────────────────────────────── */

  async searchRecords(opts: SearchOptions): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    let rows = this.db.prepare(
      'SELECT payload_json, decision_id, project_id, question_text, decision_text, domain, status FROM records WHERE status != ?'
    ).all(['withdrawn']) as any[];

    // Project isolation
    if (this.defaultIsolation === 'strict' || opts.includeShared === false) {
      rows = rows.filter(r => r.project_id === this.projectId);
    }
    // Domain filter
    if (opts.domain) rows = rows.filter(r => r.domain === opts.domain);

    // Text search across question_text + decision_text + domain
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter(r =>
        `${r.question_text ?? ''} ${r.decision_text ?? ''} ${r.domain ?? ''}`.toLowerCase().includes(q)
      );
    }

    let parsed = rows.map(r => r.payload_json ? JSON.parse(r.payload_json) : null).filter(Boolean);

    // Parent prompt filter (searches decision context)
    if (opts.parentPrompt) {
      const needle = opts.parentPrompt.toLowerCase();
      parsed = parsed.filter((r: any) => {
        const d = this.db.prepare('SELECT decision_json FROM decisions WHERE decision_id=?').get(r.decision_id) as any;
        if (!d) return false;
        const ctx = JSON.parse(d.decision_json) as DecisionContext;
        return ctx.parent_prompt?.toLowerCase().includes(needle) ?? false;
      });
    }

    return opts.limit ? parsed.slice(0, opts.limit) : parsed;
  }

  /* ── Agent queries ───────────────────────────────── */

  async getAgentDecisions(agentId: string, domain?: string): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    const rows = this.db.prepare('SELECT payload_json FROM records WHERE agent_id=?').all([agentId]) as any[];
    const parsed = rows.map(r => r.payload_json ? JSON.parse(r.payload_json) : null).filter(Boolean);
    return domain ? parsed.filter(r => r.domain === domain) : parsed;
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const stats = new Map<string, { count: number; conf: number }>();
    for (const r of records) {
      const c = stats.get(r.domain) ?? { count: 0, conf: 0 };
      c.count += 1;
      c.conf += ("confidence" in r ? r.confidence : 0.8);
      stats.set(r.domain, c);
    }
    const domains = [...stats.keys()];
    const strengths = domains.filter(d => { const s = stats.get(d)!; return (s.conf / s.count) >= 0.7; });
    const weaknesses = domains.filter(d => { const s = stats.get(d)!; return (s.conf / s.count) < 0.7; });
    return { agent_id: agentId, domains, strengths, weaknesses, updated_at: new Date().toISOString() };
  }

  /* ── Search logging ─────────────────────────────── */

  async logSearch(query: string, domain: string | undefined, hits: number): Promise<void> {
    this.db.prepare('INSERT INTO search_log(query, domain, project_id, hits, cross_project_hits, searched_at) VALUES (?,?,?,?,?,?)').run([
      query,
      domain ?? null,
      this.projectId,
      hits,
      0,
      new Date().toISOString()
    ]);
  }

  /* ── Sync surface (DS-0 §6) ─────────────────────────────────────── */

  async getSyncCursor(): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM sync_state WHERE key = ?').get('pull_cursor') as { value: string } | undefined;
    return row?.value ?? null;
  }

  async setSyncCursor(cursor: string): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO sync_state(key, value) VALUES (?, ?)').run('pull_cursor', cursor);
  }

  /**
   * Upsert a record pulled from the cloud.
   * - Sets source='cloud' on insert.
   * - On conflict by decision_id: applies status-only update (tombstone / superseded).
   *   Never overwrites decision_text to preserve append-only semantics.
   */
  async upsertCloudRecord(item: SyncPushItem): Promise<void> {
    const existing = this.db.prepare('SELECT record_id, status FROM records WHERE decision_id = ?').get(item.decision_id) as { record_id: string; status: string } | undefined;

    if (existing) {
      // Status-only update (tombstone + superseded are the only valid transitions)
      this.db.prepare('UPDATE records SET status = ? WHERE decision_id = ?').run(item.status, item.decision_id);
    } else {
      // Fresh cloud record — upsert constraint set from flat constraints[] array if provided
      if (Array.isArray(item.constraints) && item.constraints.length > 0) {
        const summary = item.constraints.join('; ');
        this.db.prepare(
          'INSERT OR IGNORE INTO constraint_sets(constraint_set_id, atoms, summary) VALUES (?,?,?)'
        ).run(item.constraint_set_id, JSON.stringify(item.constraints), summary);
      }

      const recordId = item.decision_id;
      const payloadJson: Record<string, unknown> = {
        decision_id: item.decision_id,
        q_id: item.q_id,
        agent_id: item.agent_id,
        domain: item.domain,
        question_text: item.question_text ?? null,
        decision_text: item.decision_text,
        constraint_set_id: item.constraint_set_id,
        refs: item.refs,
        status: item.status,
        supersedes_id: item.supersedes_id ?? null,
        timestamp: item.timestamp
      };

      this.db.prepare(`
        INSERT OR REPLACE INTO records(
          record_id, decision_id, q_id, agent_id, domain, project_id,
          question_text, decision_text, constraint_set_id,
          refs, status, supersedes_id, timestamp, payload_json, source
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run([
        recordId,
        item.decision_id,
        item.q_id,
        item.agent_id,
        item.domain,
        this.projectId,
        item.question_text ?? null,
        item.decision_text,
        item.constraint_set_id,
        JSON.stringify(item.refs),
        item.status,
        item.supersedes_id ?? null,
        item.timestamp,
        JSON.stringify(payloadJson),
        'cloud'
      ]);
    }
  }

  /**
   * Return local (source='local') records joined with their constraint sets,
   * ready to be batched into a push request.
   */
  async listLocalRecordsForPush(): Promise<SyncPushItem[]> {
    const rows = this.db.prepare(
      `SELECT r.decision_id, r.q_id, r.agent_id, r.domain, r.question_text,
              r.decision_text, r.constraint_set_id, r.refs, r.status,
              r.supersedes_id, r.timestamp,
              cs.atoms AS cs_atoms, cs.summary AS cs_summary
       FROM records r
       LEFT JOIN constraint_sets cs ON cs.constraint_set_id = r.constraint_set_id
       WHERE r.source = 'local'`
    ).all() as Array<{
      decision_id: string;
      q_id: string;
      agent_id: string;
      domain: string;
      question_text: string | null;
      decision_text: string;
      constraint_set_id: string;
      refs: string;
      status: string;
      supersedes_id: string | null;
      timestamp: string;
      cs_atoms: string | null;
      cs_summary: string | null;
    }>;

    // Import here to avoid circular at module level (content-hash is a sibling module)
    const { computeContentHash } = await import('../sync/content-hash');

    return rows.map((r) => {
      const refs: string[] = r.refs ? JSON.parse(r.refs) : [];
      const contentHash = computeContentHash({
        question_text: r.question_text,
        decision_text: r.decision_text,
        constraint_set_id: r.constraint_set_id,
        domain: r.domain,
        agent_id: r.agent_id,
        refs
      });
      // constraints: flat string[] the server reads as item.constraints for mcp_constraint_sets upsert
      const constraints: string[] = r.cs_atoms ? JSON.parse(r.cs_atoms) : [];
      const item: SyncPushItem = {
        decision_id: r.decision_id,
        q_id: r.q_id,
        question_text: r.question_text,
        decision_text: r.decision_text,
        constraint_set_id: r.constraint_set_id,
        constraints,
        domain: r.domain,
        agent_id: r.agent_id,
        refs,
        status: r.status,
        supersedes_id: r.supersedes_id,
        timestamp: r.timestamp,
        content_hash: contentHash
      };
      return item;
    });
  }
}
