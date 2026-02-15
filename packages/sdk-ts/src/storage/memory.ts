import type { CompetencyProfile, DecisionContext, DecisionRecord } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export class InMemoryStorage implements StorageAdapter {
  private readonly decisions = new Map<string, DecisionContext>();
  private readonly records = new Map<string, DecisionRecord>();

  async saveDecision(context: DecisionContext): Promise<void> {
    this.decisions.set(context.decision_id, context);
  }

  async saveRecord(record: DecisionRecord): Promise<void> {
    this.records.set(record.record_id, record);
  }

  async getRecord(recordId: string): Promise<DecisionRecord | null> {
    return this.records.get(recordId) ?? null;
  }

  async searchRecords(opts: SearchOptions): Promise<DecisionRecord[]> {
    let results = Array.from(this.records.values());

    if (opts.domain) {
      results = results.filter((record) => record.domain === opts.domain);
    }

    if (opts.minConfidence !== undefined) {
      results = results.filter((record) => record.confidence >= opts.minConfidence!);
    }

    if (opts.parentPrompt) {
      const needle = opts.parentPrompt.toLowerCase();
      results = results.filter((record) => {
        const decision = this.decisions.get(record.decision_id);
        return decision?.parent_prompt?.toLowerCase().includes(needle) ?? false;
      });
    }

    if (opts.query) {
      const needle = opts.query.toLowerCase();
      results = results.filter((record) => {
        const haystack = [
          record.question,
          record.answer,
          record.domain,
          ...record.tags,
          ...record.constraints_snapshot.map((c) => c.description),
          ...record.evidence_snapshot.flatMap((e) => [e.claim, e.proof])
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(needle);
      });
    }

    const limit = opts.limit ?? results.length;

    return results.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, limit);
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]> {
    return Array.from(this.records.values()).filter(
      (record) => record.agent_id === agentId && (domain ? record.domain === domain : true)
    );
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    const records = await this.getAgentDecisions(agentId);
    const domainScores = new Map<string, number[]>();

    for (const record of records) {
      const scores = domainScores.get(record.domain) ?? [];
      scores.push(record.confidence);
      domainScores.set(record.domain, scores);
    }

    const domains = Array.from(domainScores.keys());
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const [domain, scores] of domainScores.entries()) {
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      if (average >= 0.8) {
        strengths.push(domain);
      }
      if (average < 0.65) {
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
