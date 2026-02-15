import Database from 'better-sqlite3';
import type { CompetencyProfile, DecisionContext, DecisionRecord } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

interface StoredRecord {
  record_id: string;
  decision_id: string;
  agent_id: string;
  domain: string;
  question: string;
  answer: string;
  confidence: number;
  tags: string;
  evidence_text: string;
  record_json: string;
  published_at: string;
}

export class SQLiteStorage implements StorageAdapter {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        decision_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        parent_prompt TEXT,
        created_at TEXT NOT NULL,
        decision_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS records (
        record_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        confidence REAL NOT NULL,
        tags TEXT NOT NULL,
        evidence_text TEXT NOT NULL,
        published_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        FOREIGN KEY(decision_id) REFERENCES decisions(decision_id)
      );
    `);
  }

  async saveDecision(context: DecisionContext): Promise<void> {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO decisions (decision_id, agent_id, domain, parent_prompt, created_at, decision_json)
      VALUES (@decision_id, @agent_id, @domain, @parent_prompt, @created_at, @decision_json)
    `);

    statement.run({
      decision_id: context.decision_id,
      agent_id: context.agent_id,
      domain: context.domain,
      parent_prompt: context.parent_prompt ?? null,
      created_at: context.created_at,
      decision_json: JSON.stringify(context)
    });
  }

  async saveRecord(record: DecisionRecord): Promise<void> {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO records (
        record_id, decision_id, agent_id, domain, question, answer, confidence, tags,
        evidence_text, published_at, record_json
      )
      VALUES (
        @record_id, @decision_id, @agent_id, @domain, @question, @answer, @confidence, @tags,
        @evidence_text, @published_at, @record_json
      )
    `);

    statement.run({
      record_id: record.record_id,
      decision_id: record.decision_id,
      agent_id: record.agent_id,
      domain: record.domain,
      question: record.question,
      answer: record.answer,
      confidence: record.confidence,
      tags: JSON.stringify(record.tags),
      evidence_text: record.evidence_snapshot.map((item) => `${item.claim} ${item.proof}`).join(' '),
      published_at: record.published_at,
      record_json: JSON.stringify(record)
    });
  }

  async getRecord(recordId: string): Promise<DecisionRecord | null> {
    const row = this.db
      .prepare('SELECT record_json FROM records WHERE record_id = ?')
      .get(recordId) as { record_json: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.record_json) as DecisionRecord;
  }

  async searchRecords(opts: SearchOptions): Promise<DecisionRecord[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.domain) {
      conditions.push('records.domain = @domain');
      params.domain = opts.domain;
    }

    if (opts.minConfidence !== undefined) {
      conditions.push('records.confidence >= @minConfidence');
      params.minConfidence = opts.minConfidence;
    }

    if (opts.parentPrompt) {
      conditions.push('LOWER(decisions.parent_prompt) LIKE @parentPrompt');
      params.parentPrompt = `%${opts.parentPrompt.toLowerCase()}%`;
    }

    if (opts.query) {
      conditions.push(`(
        LOWER(records.question) LIKE @query OR
        LOWER(records.answer) LIKE @query OR
        LOWER(records.domain) LIKE @query OR
        LOWER(records.tags) LIKE @query OR
        LOWER(records.evidence_text) LIKE @query
      )`);
      params.query = `%${opts.query.toLowerCase()}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts.limit ? `LIMIT ${Math.max(1, opts.limit)}` : '';

    const rows = this.db
      .prepare(
        `SELECT records.record_json FROM records
         LEFT JOIN decisions ON decisions.decision_id = records.decision_id
         ${whereClause}
         ORDER BY records.published_at DESC
         ${limitClause}`
      )
      .all(params) as Array<{ record_json: string }>;

    return rows.map((row) => JSON.parse(row.record_json) as DecisionRecord);
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]> {
    const statement = domain
      ? this.db.prepare(
          'SELECT record_json FROM records WHERE agent_id = @agentId AND domain = @domain ORDER BY published_at DESC'
        )
      : this.db.prepare('SELECT record_json FROM records WHERE agent_id = @agentId ORDER BY published_at DESC');

    const rows = statement.all({ agentId, domain }) as Array<{ record_json: string }>;
    return rows.map((row) => JSON.parse(row.record_json) as DecisionRecord);
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const scoresByDomain = new Map<string, number[]>();

    for (const record of records) {
      const scores = scoresByDomain.get(record.domain) ?? [];
      scores.push(record.confidence);
      scoresByDomain.set(record.domain, scores);
    }

    const domains = Array.from(scoresByDomain.keys());
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const [domain, scores] of scoresByDomain.entries()) {
      const avg = scores.reduce((acc, score) => acc + score, 0) / scores.length;
      if (avg >= 0.8) {
        strengths.push(domain);
      }
      if (avg < 0.65) {
        weaknesses.push(domain);
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
