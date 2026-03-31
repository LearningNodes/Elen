import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export class InMemoryStorage implements StorageAdapter {
  private readonly constraintSets = new Map<string, ConstraintSet>();
  private readonly records = new Map<string, MinimalDecisionRecord | DecisionRecord>();
  private readonly decisions = new Map<string, DecisionContext>();

  async saveDecision(decision: DecisionContext): Promise<void> { this.decisions.set(decision.decision_id, decision); }
  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> { if (!this.constraintSets.has(constraintSet.constraint_set_id)) this.constraintSets.set(constraintSet.constraint_set_id, constraintSet); }
  async getConstraintSet(id: string): Promise<ConstraintSet | null> { return this.constraintSets.get(id) ?? null; }
  async saveRecord(record: MinimalDecisionRecord | DecisionRecord): Promise<void> { this.records.set(("record_id" in record ? record.record_id : record.decision_id), record); }
  async saveLegacyRecord(record: DecisionRecord): Promise<void> { this.records.set(record.record_id, record); }
  async getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null> { return this.records.get(recordId) ?? null; }

  async searchRecords(opts: SearchOptions): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    let results = Array.from(this.records.values());
    if (opts.domain) results = results.filter((r) => r.domain === opts.domain);
    if (typeof opts.minConfidence === 'number') results = results.filter((r) => ('confidence' in r ? r.confidence >= opts.minConfidence! : true));
    if (opts.parentPrompt) {
      const needle = opts.parentPrompt.toLowerCase();
      results = results.filter((r) => {
        const ctx = this.decisions.get(r.decision_id);
        return ctx?.parent_prompt?.toLowerCase().includes(needle) ?? false;
      });
    }
    if (opts.query) {
      const needle = opts.query.toLowerCase();
      results = results.filter((r) => {
        const haystack = 'decision_text' in r ? `${r.question_text ?? ''} ${r.decision_text} ${r.domain}` : `${r.question} ${r.answer} ${r.domain} ${r.constraints_snapshot.map(c=>c.description).join(' ')} ${r.evidence_snapshot.map(e=>`${e.claim} ${e.proof}`).join(' ')}`;
        return haystack.toLowerCase().includes(needle);
      });
    }
    const limit = opts.limit ?? results.length;
    return results.slice(0, limit);
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    return Array.from(this.records.values()).filter((r) => r.agent_id === agentId && (domain ? r.domain === domain : true));
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const stats = new Map<string, {count:number; conf:number}>();
    for (const r of records) {
      const cur = stats.get(r.domain) ?? {count:0, conf:0};
      cur.count += 1;
      cur.conf += ("confidence" in r ? r.confidence : 0.8);
      stats.set(r.domain, cur);
    }
    const domains = [...stats.keys()];
    const strengths = domains.filter((d)=>{ const s=stats.get(d)!; return s.count >= 1 && (s.conf/s.count) >= 0.7;});
    const weaknesses = domains.filter((d)=>{ const s=stats.get(d)!; return (s.conf/s.count) < 0.7;});
    return { agent_id: agentId, domains, strengths, weaknesses, updated_at: new Date().toISOString() };
  }

  async logSearch(_query: string, _domain: string | undefined, _hits: number): Promise<void> { }
}
