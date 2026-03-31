import Database from 'better-sqlite3';
import type { CompetencyProfile, ConstraintSet, DecisionContext, DecisionRecord, MinimalDecisionRecord } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export class SQLiteStorage implements StorageAdapter {
  private readonly db: Database.Database;
  private readonly projectId: string;
  private readonly defaultIsolation: 'strict' | 'open';

  constructor(path: string, projectId: string = 'default', defaultIsolation: 'strict' | 'open' = 'strict') {
    this.db = new Database(path);
    this.projectId = projectId;
    this.defaultIsolation = defaultIsolation;
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS constraint_sets (constraint_set_id TEXT PRIMARY KEY, atoms TEXT NOT NULL, summary TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (decision_id TEXT PRIMARY KEY, decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS search_log (search_id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, domain TEXT, project_id TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, cross_project_hits INTEGER NOT NULL DEFAULT 0, searched_at TEXT NOT NULL);
    `);

    // Check if records table exists and what schema it has
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get();

    if (!tableExists) {
      // Fresh DB: create spec-compliant table
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
          payload_json      TEXT
        );
      `);
      return;
    }

    // Table exists — check if it needs migration
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
            payload_json      TEXT
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
}
