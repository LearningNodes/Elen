import Database from 'better-sqlite3';
import type { CompetencyProfile, DecisionRecord, ConstraintSet } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export interface ProjectRecord {
  project_id: string;
  display_name: string;
  source_hint: string | null;
  created_at: string;
}

export interface ProjectSharingRecord {
  source_project_id: string;
  target_project_id: string;
  direction: 'one-way' | 'bi-directional';
  enabled: number;
}

export class SQLiteStorage implements StorageAdapter {
  private readonly db: Database.Database;
  private readonly projectId: string;

  constructor(path: string, projectId: string = 'default') {
    this.db = new Database(path);
    this.projectId = projectId;
    this.init();
  }

  private init(): void {
    const pragmaQuery = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    const versionRow = pragmaQuery ? pragmaQuery.user_version : 0;

    if (versionRow === 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS constraint_sets (
          constraint_set_id TEXT PRIMARY KEY,
          atoms TEXT NOT NULL,
          summary TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
  
        CREATE TABLE IF NOT EXISTS records (
          record_id TEXT PRIMARY KEY,
          decision_id TEXT NOT NULL,
          q_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          domain TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT 'default',
          decision_text TEXT NOT NULL,
          constraint_set_id TEXT NOT NULL,
          refs TEXT NOT NULL,
          status TEXT NOT NULL,
          supersedes_id TEXT,
          timestamp TEXT NOT NULL,
          record_json TEXT NOT NULL,
          FOREIGN KEY(constraint_set_id) REFERENCES constraint_sets(constraint_set_id)
        );
  
        CREATE TABLE IF NOT EXISTS projects (
          project_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          source_hint TEXT,
          created_at TEXT NOT NULL
        );
  
        CREATE TABLE IF NOT EXISTS project_sharing (
          source_project_id TEXT NOT NULL,
          target_project_id TEXT NOT NULL,
          direction TEXT NOT NULL DEFAULT 'one-way',
          enabled INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (source_project_id, target_project_id)
        );
  
        CREATE TABLE IF NOT EXISTS search_log (
          search_id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          domain TEXT,
          project_id TEXT NOT NULL,
          hits INTEGER NOT NULL DEFAULT 0,
          cross_project_hits INTEGER NOT NULL DEFAULT 0,
          searched_at TEXT NOT NULL
        );
      `);

      this.db.exec('PRAGMA user_version = 1');
    }

    // Ensure current project exists in projects table
    this.ensureProject(this.projectId);
  }

  private ensureProject(projectId: string, displayName?: string): void {
    const existing = this.db
      .prepare('SELECT project_id FROM projects WHERE project_id = ?')
      .get(projectId);

    if (!existing) {
      this.db.prepare(`
        INSERT INTO projects (project_id, display_name, source_hint, created_at)
        VALUES (@project_id, @display_name, @source_hint, @created_at)
      `).run({
        project_id: projectId,
        display_name: displayName || projectId.replace(/[-_]/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()),
        source_hint: null,
        created_at: new Date().toISOString()
      });
    }
  }

  // --- Project & Sharing Management ---

  getProjects(): ProjectRecord[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as ProjectRecord[];
  }

  getSharing(): ProjectSharingRecord[] {
    return this.db.prepare('SELECT * FROM project_sharing ORDER BY source_project_id').all() as ProjectSharingRecord[];
  }

  upsertSharing(source: string, target: string, direction: 'one-way' | 'bi-directional', enabled: boolean): void {
    this.db.prepare(`
      INSERT INTO project_sharing (source_project_id, target_project_id, direction, enabled)
      VALUES (@source, @target, @direction, @enabled)
      ON CONFLICT(source_project_id, target_project_id)
      DO UPDATE SET direction = @direction, enabled = @enabled
    `).run({ source, target, direction: direction, enabled: enabled ? 1 : 0 });
  }

  deleteSharing(source: string, target: string): void {
    this.db.prepare('DELETE FROM project_sharing WHERE source_project_id = ? AND target_project_id = ?')
      .run([source, target]);
  }

  private getAccessibleProjects(): string[] {
    const hasRules = this.db.prepare(`
      SELECT 1 FROM project_sharing
      WHERE source_project_id = ? OR target_project_id = ?
      LIMIT 1
    `).get(this.projectId, this.projectId);

    if (!hasRules) {
      const all = this.db.prepare('SELECT project_id FROM projects').all() as Array<{ project_id: string }>;
      const ids = new Set(all.map(r => r.project_id));
      ids.add(this.projectId);
      return [...ids];
    }

    const accessible = new Set<string>([this.projectId]);

    const inbound = this.db.prepare(`
      SELECT source_project_id FROM project_sharing
      WHERE target_project_id = ? AND enabled = 1
    `).all(this.projectId) as Array<{ source_project_id: string }>;

    for (const row of inbound) {
      accessible.add(row.source_project_id);
    }

    const bidir = this.db.prepare(`
      SELECT source_project_id, target_project_id FROM project_sharing
      WHERE direction = 'bi-directional' AND enabled = 1
        AND (source_project_id = ? OR target_project_id = ?)
    `).all([this.projectId, this.projectId]) as Array<{ source_project_id: string; target_project_id: string }>;

    for (const row of bidir) {
      accessible.add(row.source_project_id);
      accessible.add(row.target_project_id);
    }

    return [...accessible];
  }

  // --- Core Storage Methods ---

  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO constraint_sets (constraint_set_id, atoms, summary, created_at)
      VALUES (@constraint_set_id, @atoms, @summary, @created_at)
    `);

    statement.run({
      constraint_set_id: constraintSet.constraint_set_id,
      atoms: JSON.stringify(constraintSet.atoms),
      summary: constraintSet.summary,
      created_at: new Date().toISOString()
    });
  }

  async getConstraintSet(id: string): Promise<ConstraintSet | null> {
    const row = this.db
      .prepare('SELECT constraint_set_id, atoms, summary FROM constraint_sets WHERE constraint_set_id = ?')
      .get(id) as { constraint_set_id: string; atoms: string; summary: string } | undefined;

    if (!row) {
      return null;
    }

    return {
      constraint_set_id: row.constraint_set_id,
      atoms: JSON.parse(row.atoms) as string[],
      summary: row.summary
    };
  }

  async saveRecord(record: DecisionRecord): Promise<void> {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO records (
        record_id, decision_id, q_id, agent_id, domain, project_id, decision_text, 
        constraint_set_id, refs, status, supersedes_id, timestamp, record_json
      )
      VALUES (
        @record_id, @decision_id, @q_id, @agent_id, @domain, @project_id, @decision_text, 
        @constraint_set_id, @refs, @status, @supersedes_id, @timestamp, @record_json
      )
    `);

    const enrichedRecord = { ...record, project_id: this.projectId };

    statement.run({
      record_id: record.decision_id,
      decision_id: record.decision_id,
      q_id: record.q_id,
      agent_id: record.agent_id,
      domain: record.domain,
      project_id: this.projectId,
      decision_text: record.decision_text,
      constraint_set_id: record.constraint_set_id,
      refs: JSON.stringify(record.refs),
      status: record.status,
      supersedes_id: record.supersedes_id ?? null,
      timestamp: record.timestamp,
      record_json: JSON.stringify(enrichedRecord)
    });
  }

  async getRecord(recordId: string): Promise<DecisionRecord | null> {
    const row = this.db
      .prepare('SELECT record_json FROM records WHERE decision_id = ?')
      .get(recordId) as { record_json: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.record_json) as DecisionRecord;
  }

  async searchRecords(opts: SearchOptions): Promise<DecisionRecord[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.includeShared !== false) {
      const accessible = this.getAccessibleProjects();
      const placeholders = accessible.map((_, i) => `@proj${i}`);
      conditions.push(`records.project_id IN (${placeholders.join(', ')})`);
      accessible.forEach((id, i) => { params[`proj${i}`] = id; });
    } else {
      const projId = opts.projectId || this.projectId;
      conditions.push('records.project_id = @projectId');
      params.projectId = projId;
    }

    if (opts.domain) {
      conditions.push('records.domain = @domain');
      params.domain = opts.domain;
    }

    if (opts.query) {
      conditions.push(`(
        LOWER(records.decision_text) LIKE @query OR
        LOWER(records.domain) LIKE @query OR
        LOWER(records.q_id) LIKE @query
      )`);
      params.query = `%${opts.query.toLowerCase()}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts.limit ? `LIMIT ${Math.max(1, opts.limit)}` : '';

    const rows = this.db
      .prepare(
        `SELECT records.record_json FROM records
         ${whereClause}
         ORDER BY records.timestamp DESC
         ${limitClause}`
      )
      .all(params) as Array<{ record_json: string }>;

    const results = rows.map((row) => JSON.parse(row.record_json) as DecisionRecord);

    try {
      const crossProjectHits = results.filter((r: DecisionRecord & { project_id?: string }) => {
        return r.project_id && r.project_id !== this.projectId;
      }).length;

      this.db.prepare(`
        INSERT INTO search_log(query, domain, project_id, hits, cross_project_hits, searched_at)
      VALUES(@query, @domain, @project_id, @hits, @cross_project_hits, @searched_at)
        `).run({
        query: opts.query || '',
        domain: opts.domain || null,
        project_id: this.projectId,
        hits: results.length,
        cross_project_hits: crossProjectHits,
        searched_at: new Date().toISOString()
      });
    } catch {
      // Non-critical: don't fail search if logging fails
    }

    return results;
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]> {
    const statement = domain
      ? this.db.prepare(
        'SELECT record_json FROM records WHERE agent_id = @agentId AND domain = @domain ORDER BY timestamp DESC'
      )
      : this.db.prepare('SELECT record_json FROM records WHERE agent_id = @agentId ORDER BY timestamp DESC');

    const rows = statement.all({ agentId, domain }) as Array<{ record_json: string }>;
    return rows.map((row) => JSON.parse(row.record_json) as DecisionRecord);
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const domainCounts = new Map<string, number>();

    for (const record of records) {
      const count = domainCounts.get(record.domain) ?? 0;
      domainCounts.set(record.domain, count + 1);
    }

    const domains = Array.from(domainCounts.keys());
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Simply map domain frequency to strengths
    for (const [domain, count] of domainCounts.entries()) {
      if (count >= 5) {
        strengths.push(domain);
      }
    }

    return {
      agent_id: agentId,
      domains,
      strengths,
      weaknesses,
      updated_at: new Date().toISOString()
    };
  }
}
