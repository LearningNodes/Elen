import {
  minimalDecisionRecordSchema,
  constraintSetSchema,
  classifyEpistemicType,
  type MinimalDecisionRecord,
  type DecisionRecord,
  type ConstraintSet,
  type Constraint,
  type Evidence,
  type Check
} from '@learningnodes/elen-core';
import { createId, createDecisionId, createConstraintSetId } from './id';
import type { StorageAdapter } from './storage';
import type { CompetencyProfileResult, CommitDecisionInput, LogDecisionInput, SearchOptions, GetContextResult, ContextThread } from './types';

export class ElenClient {
  constructor(private readonly agentId: string, private readonly storage: StorageAdapter) { }

  async logDecision(input: LogDecisionInput): Promise<DecisionRecord> {
    if (input.constraints.length === 0) throw new Error('Decision must include at least one constraint');
    if (input.evidence.length === 0) throw new Error('Decision must include at least one evidence');

    const decisionId = createDecisionId(input.domain);
    const now = new Date().toISOString();

    const constraintsSnapshot: Constraint[] = input.constraints.map((description, i) => ({
      constraint_id: createId(`con${i}`),
      decision_id: decisionId,
      type: 'requirement',
      description,
      locked: false
    }));

    const evidenceSnapshot: Evidence[] = input.evidence.map((e, i) => ({
      evidence_id: createId(`evd${i}`),
      decision_id: decisionId,
      type: input.linkedPrecedents?.[i] ? 'precedent' : 'observation',
      claim: e,
      proof: e,
      confidence: input.confidence?.[i] ?? 0.8,
      linked_precedent: input.linkedPrecedents?.[i]
    }));

    const checksSnapshot: Check[] = evidenceSnapshot.map((e, i) => ({
      check_id: createId(`chk${i}`),
      decision_id: decisionId,
      claim: e.claim,
      result: 'pass',
      evidence_ids: [e.evidence_id],
      epistemic_type: classifyEpistemicType(e),
      confidence: e.confidence
    }));

    const record: DecisionRecord = {
      record_id: createId('rec'),
      decision_id: decisionId,
      agent_id: this.agentId,
      question: input.question,
      answer: input.answer,
      constraints_snapshot: constraintsSnapshot,
      evidence_snapshot: evidenceSnapshot,
      checks_snapshot: checksSnapshot,
      confidence: evidenceSnapshot.reduce((a, e) => a + e.confidence, 0) / evidenceSnapshot.length,
      validation_type: 'self',
      domain: input.domain,
      tags: [],
      published_at: now,
      expires_at: null
    };

    await this.storage.saveDecision?.({
      decision_id: decisionId,
      agent_id: this.agentId,
      question: input.question,
      domain: input.domain,
      status: 'validated',
      constraints: constraintsSnapshot,
      evidence: evidenceSnapshot,
      checks: checksSnapshot,
      created_at: now,
      parent_prompt: input.parentPrompt
    });

    await this.storage.saveLegacyRecord?.(record);
    return record;
  }

  async commitDecision(input: CommitDecisionInput): Promise<MinimalDecisionRecord> {
    const now = new Date().toISOString();

    const constraintSetId = createConstraintSetId(input.constraints);
    const existingConstraints = await this.storage.getConstraintSet(constraintSetId);

    if (!existingConstraints) {
      const newSet: ConstraintSet = {
        constraint_set_id: constraintSetId,
        atoms: input.constraints,
        summary: `Auto-generated summary for ${input.constraints.length} constraints`
      };
      constraintSetSchema.parse(newSet);
      await this.storage.saveConstraintSet(newSet);
    }

    const record: MinimalDecisionRecord = {
      decision_id: createDecisionId(input.domain),
      q_id: createId('q'),
      question_text: input.question,
      decision_text: input.decisionText,
      constraint_set_id: constraintSetId,
      refs: input.refs ?? [],
      status: input.status ?? 'active',
      supersedes_id: input.supersedesId,
      timestamp: now,
      agent_id: this.agentId,
      domain: input.domain
    };

    minimalDecisionRecordSchema.parse(record);
    await this.storage.saveRecord(record);

    return record;
  }

  async supersedeDecision(oldDecisionId: string, input: CommitDecisionInput): Promise<MinimalDecisionRecord> {
    const oldRecord = await this.storage.getRecord(oldDecisionId);
    if (oldRecord && 'status' in oldRecord) {
      oldRecord.status = 'superseded';
      await this.storage.saveRecord(oldRecord);
    }

    return this.commitDecision({ ...input, supersedesId: oldDecisionId });
  }

  async searchRecords(opts: SearchOptions) {
    return this.storage.searchRecords(opts);
  }

  async searchPrecedents(query: string, opts: SearchOptions = {}) {
    const direct = await this.storage.searchRecords({ ...opts, query });
    if (direct.length > 0) {
      await this.storage.logSearch?.(query, opts.domain, direct.length);
      return direct;
    }
    const fallback = await this.storage.searchRecords({ ...opts, limit: opts.limit ?? 5 });
    await this.storage.logSearch?.(query, opts.domain, fallback.length);
    return fallback;
  }

  async suggest(opts: SearchOptions): Promise<Array<Partial<MinimalDecisionRecord>>> {
    const fullRecords = await this.storage.searchRecords(opts);
    const results = fullRecords
      .filter((r): r is MinimalDecisionRecord => 'decision_text' in r)
      .map((r) => ({
        decision_id: r.decision_id,
        status: r.status,
        decision_text: r.decision_text,
        question_text: r.question_text,
        constraint_set_id: r.constraint_set_id,
        refs: r.refs,
        supersedes_id: r.supersedes_id
      }));
    await this.storage.logSearch?.(opts.query ?? '', opts.domain, results.length);
    return results;
  }

  async expand(decisionId: string): Promise<{ record: MinimalDecisionRecord, constraints: ConstraintSet } | null> {
    const record = await this.storage.getRecord(decisionId);
    if (!record || !('constraint_set_id' in record)) return null;

    const constraints = await this.storage.getConstraintSet(record.constraint_set_id);
    if (!constraints) return null;

    return { record, constraints };
  }

  async getCompetencyProfile(): Promise<CompetencyProfileResult> {
    return this.storage.getCompetencyProfile(this.agentId);
  }

  async getContext(opts?: { domain?: string; limit?: number }): Promise<GetContextResult> {
    const records = await this.storage.searchRecords({ domain: opts?.domain });
    const threadMap = new Map<string, ContextThread>();

    for (const r of records) {
      if (!('decision_text' in r)) continue;
      const domain = r.domain ?? 'general';
      let thread = threadMap.get(domain);
      if (!thread) {
        thread = { domain, count: 0, latest_timestamp: '', decisions: [] };
        threadMap.set(domain, thread);
      }
      thread.count += 1;
      if (r.timestamp > thread.latest_timestamp) thread.latest_timestamp = r.timestamp;
      thread.decisions.push({
        decision_id: r.decision_id,
        question_text: r.question_text,
        decision_text: r.decision_text,
        status: r.status,
        timestamp: r.timestamp
      });
    }

    let threads = Array.from(threadMap.values());
    threads.sort((a, b) => b.latest_timestamp.localeCompare(a.latest_timestamp));
    if (opts?.limit) threads = threads.slice(0, opts.limit);

    return { threads };
  }
}
