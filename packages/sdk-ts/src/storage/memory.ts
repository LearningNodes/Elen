import type { CompetencyProfile, ConstraintSet, DecisionRecord } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export class InMemoryStorage implements StorageAdapter {
  private readonly constraintSets = new Map<string, ConstraintSet>();
  private readonly records = new Map<string, DecisionRecord>();

  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> {
    if (!this.constraintSets.has(constraintSet.constraint_set_id)) {
      this.constraintSets.set(constraintSet.constraint_set_id, constraintSet);
    }
  }

  async getConstraintSet(id: string): Promise<ConstraintSet | null> {
    return this.constraintSets.get(id) ?? null;
  }

  async saveRecord(record: DecisionRecord): Promise<void> {
    this.records.set(record.decision_id, record);
  }

  async getRecord(recordId: string): Promise<DecisionRecord | null> {
    return this.records.get(recordId) ?? null;
  }

  async searchRecords(opts: SearchOptions): Promise<DecisionRecord[]> {
    let results = Array.from(this.records.values());

    if (opts.domain) {
      results = results.filter((record) => record.domain === opts.domain);
    }

    if (opts.query) {
      const needle = opts.query.toLowerCase();
      results = results.filter((record) => {
        const haystack = [
          record.decision_text,
          record.domain,
          record.q_id
        ].join(' ').toLowerCase();

        return haystack.includes(needle);
      });
    }

    const limit = opts.limit ?? results.length;

    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]> {
    return Array.from(this.records.values()).filter(
      (record) => record.agent_id === agentId && (domain ? record.domain === domain : true)
    );
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
