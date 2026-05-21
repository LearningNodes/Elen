import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';
import type { StorageAdapter } from './interface';

export interface CloudMcpStorageOptions {
  apiUrl: string;
  userEmail: string;
  agentId: string;
  apiKey?: string;
  /** Fallback local adapter for read paths until cloud sync read ships (DS-1). */
  localFallback?: StorageAdapter;
}

/**
 * LN-connected MCP storage: commits target cloud mcp_decisions via ai-service.
 * Reads delegate to local fallback (SQLite) when provided.
 */
export class CloudMcpStorage implements StorageAdapter {
  constructor(private readonly opts: CloudMcpStorageOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Email': this.opts.userEmail,
      'X-Agent-Id': this.opts.agentId
    };
    if (this.opts.apiKey) {
      h.Authorization = `Bearer ${this.opts.apiKey}`;
    }
    return h;
  }

  private baseUrl(): string {
    return this.opts.apiUrl.replace(/\/$/, '');
  }

  async saveDecision(decision: DecisionContext): Promise<void> {
    if (this.opts.localFallback?.saveDecision) {
      await this.opts.localFallback.saveDecision(decision);
    }
  }

  async saveConstraintSet(constraintSet: ConstraintSet): Promise<void> {
    if (this.opts.localFallback?.saveConstraintSet) {
      await this.opts.localFallback.saveConstraintSet(constraintSet);
    }
  }

  async getConstraintSet(id: string): Promise<ConstraintSet | null> {
    if (this.opts.localFallback) {
      return this.opts.localFallback.getConstraintSet(id);
    }
    return null;
  }

  async saveRecord(record: MinimalDecisionRecord | DecisionRecord): Promise<void> {
    if (!('decision_text' in record)) {
      if (this.opts.localFallback?.saveLegacyRecord) {
        await this.opts.localFallback.saveLegacyRecord(record as DecisionRecord);
      }
      return;
    }

    const minimal = record as MinimalDecisionRecord;
    const cs = await this.getConstraintSet(minimal.constraint_set_id);
    const constraints = cs?.atoms ?? [];

    const res = await fetch(`${this.baseUrl()}/elen/mcp/commit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        question: minimal.question_text,
        domain: minimal.domain,
        decisionText: minimal.decision_text,
        constraints: constraints.length ? constraints : ['(committed via MCP)'],
        refs: minimal.refs ?? [],
        supersedesId: minimal.supersedes_id ?? undefined,
        agent_id: this.opts.agentId
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Cloud MCP commit failed (${res.status}): ${errBody}`);
    }
  }

  async saveLegacyRecord(record: DecisionRecord): Promise<void> {
    if (this.opts.localFallback?.saveLegacyRecord) {
      await this.opts.localFallback.saveLegacyRecord(record);
    }
  }

  async getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null> {
    if (this.opts.localFallback) {
      return this.opts.localFallback.getRecord(recordId);
    }
    return null;
  }

  async searchRecords(opts: SearchOptions = {}): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    if (this.opts.localFallback) {
      return this.opts.localFallback.searchRecords(opts);
    }
    return [];
  }

  async getAgentDecisions(agentId: string, domain?: string): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    if (this.opts.localFallback) {
      return this.opts.localFallback.getAgentDecisions(agentId, domain);
    }
    return [];
  }

  async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    if (this.opts.localFallback) {
      return this.opts.localFallback.getCompetencyProfile(agentId);
    }
    return {
      agent_id: agentId,
      domains: [],
      strengths: [],
      weaknesses: [],
      updated_at: new Date().toISOString()
    };
  }

  async logSearch(query: string, domain: string | undefined, hits: number): Promise<void> {
    if (this.opts.localFallback?.logSearch) {
      await this.opts.localFallback.logSearch(query, domain, hits);
    }
  }
}
