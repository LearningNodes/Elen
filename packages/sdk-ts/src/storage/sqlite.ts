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
      CREATE TABLE IF NOT EXISTS records (
        record_id TEXT PRIMARY KEY,
        decision_id TEXT,
        agent_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        project_id TEXT NOT NULL,
        question_text TEXT,
        decision_text TEXT,
        confidence REAL,
        payload_json TEXT NOT NULL
      );
    `);
  }

  async saveDecision(decision: DecisionContext): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO decisions(decision_id, decision_json) VALUES (?,?)').run([decision.decision_id, JSON.stringify(decision)]); 
  }
  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO constraint_sets(constraint_set_id, atoms, summary) VALUES (?,?,?)').run([constraintSet.constraint_set_id, JSON.stringify(constraintSet.atoms), constraintSet.summary]);
  }
  async getConstraintSet(id: string): Promise<ConstraintSet | null> {
    const row = this.db.prepare('SELECT * FROM constraint_sets WHERE constraint_set_id=?').get(id) as any;
    return row ? { constraint_set_id: row.constraint_set_id, atoms: JSON.parse(row.atoms), summary: row.summary } : null;
  }
  async saveRecord(record: MinimalDecisionRecord | DecisionRecord): Promise<void> {
    if ("record_id" in record) {
      await this.saveLegacyRecord(record);
      return;
    }
    this.db.prepare('INSERT OR REPLACE INTO records(record_id, decision_id, agent_id, domain, project_id, question_text, decision_text, payload_json) VALUES (?,?,?,?,?,?,?,?)').run([record.decision_id, record.decision_id, record.agent_id, record.domain, this.projectId, record.question_text ?? null, record.decision_text, JSON.stringify(record)]);
  }
  async saveLegacyRecord(record: DecisionRecord): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO records(record_id, decision_id, agent_id, domain, project_id, question_text, decision_text, confidence, payload_json) VALUES (?,?,?,?,?,?,?,?,?)').run([record.record_id, record.decision_id, record.agent_id, record.domain, this.projectId, record.question, record.answer, record.confidence, JSON.stringify(record)]);
  }
  async getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null> {
    const row = this.db.prepare('SELECT payload_json FROM records WHERE record_id=? OR decision_id=?').get([recordId, recordId]) as any;
    return row ? JSON.parse(row.payload_json) : null;
  }
  async searchRecords(opts: SearchOptions): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    let rows = this.db.prepare('SELECT payload_json, decision_id, project_id, confidence, question_text, decision_text, domain FROM records').all() as any[];
    if (this.defaultIsolation === 'strict' || opts.includeShared === false) rows = rows.filter(r => r.project_id === this.projectId);
    if (opts.domain) rows = rows.filter(r => r.domain === opts.domain);
    if (typeof opts.minConfidence === 'number') rows = rows.filter(r => r.confidence == null || r.confidence >= opts.minConfidence!);
    if (opts.query) {
      const q=opts.query.toLowerCase();
      rows=rows.filter(r => { const p = JSON.parse(r.payload_json); const extra = p.constraints_snapshot ? `${p.constraints_snapshot.map((c:any)=>c.description).join(' ')} ${p.evidence_snapshot.map((e:any)=>`${e.claim} ${e.proof}`).join(' ')}` : ''; return `${r.question_text ?? ''} ${r.decision_text ?? ''} ${r.domain ?? ''} ${extra}`.toLowerCase().includes(q); });
    }
    let parsed = rows.map(r => JSON.parse(r.payload_json));
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
  async getAgentDecisions(agentId: string, domain?: string): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    const rows = this.db.prepare('SELECT payload_json FROM records WHERE agent_id=?').all([agentId]) as any[];
    const parsed = rows.map(r => JSON.parse(r.payload_json));
    return domain ? parsed.filter(r => r.domain === domain) : parsed;
  }
  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const stats = new Map<string, {count:number; conf:number}>();
    for (const r of records) { const c=stats.get(r.domain) ?? {count:0, conf:0}; c.count +=1; c.conf += ("confidence" in r ? r.confidence : 0.8); stats.set(r.domain,c); }
    const domains=[...stats.keys()];
    const strengths=domains.filter(d=>{const s=stats.get(d)!; return (s.conf/s.count)>=0.7;});
    const weaknesses=domains.filter(d=>{const s=stats.get(d)!; return (s.conf/s.count)<0.7;});
    return { agent_id: agentId, domains, strengths, weaknesses, updated_at: new Date().toISOString() };
  }
}
