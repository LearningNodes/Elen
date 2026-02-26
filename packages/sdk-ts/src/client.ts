import {
  decisionRecordSchema,
  constraintSetSchema,
  type DecisionRecord,
  type ConstraintSet
} from '@learningnodes/elen-core';
import { createId, createDecisionId, createConstraintSetId } from './id';
import type { StorageAdapter } from './storage';
import type { CompetencyProfileResult, CommitDecisionInput, SearchOptions } from './types';

export class ElenClient {
  constructor(private readonly agentId: string, private readonly storage: StorageAdapter) { }

  async commitDecision(input: CommitDecisionInput): Promise<DecisionRecord> {
    const now = new Date().toISOString();

    // 1. Resolve Constraints (Deterministic Hashing server-side)
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

    // 2. Build the Minimal Decision Atom
    const record: DecisionRecord = {
      decision_id: createDecisionId(input.domain),
      q_id: createId('q'),
      decision_text: input.decisionText,
      constraint_set_id: constraintSetId,
      refs: input.refs ?? [],
      status: input.status ?? 'active',
      supersedes_id: input.supersedesId,
      timestamp: now,
      agent_id: this.agentId,
      domain: input.domain
    };

    decisionRecordSchema.parse(record);
    await this.storage.saveRecord(record);

    return record;
  }

  async supersedeDecision(oldDecisionId: string, input: CommitDecisionInput): Promise<DecisionRecord> {
    // 1. Mark old as superseded
    const oldRecord = await this.storage.getRecord(oldDecisionId);
    if (oldRecord) {
      oldRecord.status = 'superseded';
      await this.storage.saveRecord(oldRecord);
    }

    // 2. Commit new
    return this.commitDecision({
      ...input,
      supersedesId: oldDecisionId
    });
  }

  async suggest(opts: SearchOptions): Promise<Partial<DecisionRecord>[]> {
    const fullRecords = await this.storage.searchRecords(opts);

    // Pointer-first retrieval (minimal payload)
    return fullRecords.map(r => ({
      decision_id: r.decision_id,
      status: r.status,
      decision_text: r.decision_text,
      constraint_set_id: r.constraint_set_id,
      refs: r.refs,
      supersedes_id: r.supersedes_id
    }));
  }

  async expand(decisionId: string): Promise<{ record: DecisionRecord, constraints: ConstraintSet } | null> {
    const record = await this.storage.getRecord(decisionId);
    if (!record) return null;

    const constraints = await this.storage.getConstraintSet(record.constraint_set_id);
    if (!constraints) return null;

    return { record, constraints };
  }

  async getCompetencyProfile(): Promise<CompetencyProfileResult> {
    return this.storage.getCompetencyProfile(this.agentId);
  }
}
