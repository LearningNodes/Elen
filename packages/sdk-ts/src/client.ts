import {
  canSubmitForValidation,
  classifyEpistemicType,
  decisionContextSchema,
  decisionRecordSchema,
  type Check,
  type DecisionContext,
  type DecisionRecord,
  type Evidence
} from '@learningnodes/elen-core';
import { createId } from './id';
import type { StorageAdapter } from './storage';
import type { CompetencyProfileResult, LogDecisionInput, SearchOptions, SearchPrecedentsOptions } from './types';

export class ElenClient {
  constructor(private readonly agentId: string, private readonly storage: StorageAdapter) {}

  async logDecision(input: LogDecisionInput): Promise<DecisionRecord> {
    const now = new Date().toISOString();
    const decisionId = createId('dec');

    const constraints = input.constraints.map((description) => ({
      constraint_id: createId('con'),
      decision_id: decisionId,
      type: 'requirement' as const,
      description,
      locked: false
    }));

    const evidence: Evidence[] = input.evidence.map((proof, index) => {
      const linked = input.linkedPrecedents?.[index] ?? input.linkedPrecedents?.[0];
      return {
        evidence_id: createId('evd'),
        decision_id: decisionId,
        type: linked ? 'precedent' : 'observation',
        claim: proof,
        proof,
        confidence: input.confidence?.[index] ?? 0.8,
        linked_precedent: linked
      };
    });

    const checks: Check[] = evidence.map((item) => ({
      check_id: createId('chk'),
      decision_id: decisionId,
      claim: item.claim,
      result: 'inconclusive',
      evidence_ids: [item.evidence_id],
      epistemic_type: classifyEpistemicType(item),
      confidence: item.confidence
    }));

    const context: DecisionContext = {
      decision_id: decisionId,
      agent_id: this.agentId,
      question: input.question,
      domain: input.domain,
      status: input.status ?? 'validated',
      constraints,
      evidence,
      checks,
      parent_prompt: input.parentPrompt,
      linked_decisions: input.linkedPrecedents,
      created_at: now
    };

    decisionContextSchema.parse(context);

    const gate = canSubmitForValidation(context);
    if (!gate.valid) {
      throw new Error(gate.errors.join(' '));
    }

    const confidence = evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length;

    const record: DecisionRecord = {
      record_id: createId('rec'),
      decision_id: decisionId,
      agent_id: this.agentId,
      question: input.question,
      answer: input.answer,
      constraints_snapshot: constraints,
      evidence_snapshot: evidence,
      checks_snapshot: checks,
      confidence,
      validation_type: 'self',
      domain: input.domain,
      tags: input.tags ?? [],
      published_at: now,
      expires_at: null
    };

    decisionRecordSchema.parse(record);

    await this.storage.saveDecision(context);
    await this.storage.saveRecord(record);

    return record;
  }

  async searchRecords(opts: SearchOptions): Promise<DecisionRecord[]> {
    return this.storage.searchRecords(opts);
  }

  async searchPrecedents(query: string, opts: SearchPrecedentsOptions = {}): Promise<DecisionRecord[]> {
    return this.storage.searchRecords({ query, limit: opts.limit ?? 10 });
  }

  async getCompetencyProfile(): Promise<CompetencyProfileResult> {
    return this.storage.getCompetencyProfile(this.agentId);
  }
}
