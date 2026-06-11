import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { SearchOptions, SyncPushRequest, SyncPushResponse, SyncPullResponse } from '../types';
import type { StorageAdapter } from './interface';

export interface CloudMcpStorageOptions {
  apiUrl: string;
  /**
   * Primary auth: Bearer lnk_ API key from /settings/api-keys.
   * Required for /elen/sync/* routes (DS-0 §6.4).
   */
  apiKey?: string;
  /**
   * LN identity email — optional/legacy.
   * Sent as X-User-Email only when present, for /elen/mcp/commit attribution.
   * Cloud sync routes authenticate via apiKey only.
   */
  userEmail?: string;
  agentId: string;
  /** Fallback local adapter for read paths until cloud sync read ships (DS-1). */
  localFallback?: StorageAdapter;
}

/**
 * LN-connected MCP storage: commits target cloud mcp_decisions via ai-service.
 * Reads delegate to local fallback (SQLite) when provided.
 * Connected-mode reads merge local rows (which include pulled source='cloud' rows)
 * so suggest/search sees shared content without client-side ACL filtering
 * (server already filtered on push/pull).
 *
 * NOTE: /elen/sync/* routes depend on Bearer lnk_ API-key auth at the gateway.
 * Do NOT ship sync calls against JWT-only sync routes — see BLOCKER note in plan.
 */
export class CloudMcpStorage implements StorageAdapter {
  constructor(private readonly opts: CloudMcpStorageOptions) {}

  private headers(forSync = false): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-Id': this.opts.agentId
    };
    if (this.opts.apiKey) {
      h.Authorization = `Bearer ${this.opts.apiKey}`;
    }
    // X-User-Email is optional/legacy — only sent for /elen/mcp/commit attribution
    // and only when not in sync-only mode (sync routes use Bearer key exclusively)
    if (this.opts.userEmail && !forSync) {
      h['X-User-Email'] = this.opts.userEmail;
    }
    return h;
  }

  private baseUrl(): string {
    return this.opts.apiUrl.replace(/\/$/, '');
  }

  /**
   * POST /elen/sync/push — send a batch of local records to the cloud.
   * Server reads req.body.items — the SyncPushRequest type uses field `items`.
   * Throws on non-2xx with body text (matches existing error style).
   *
   * BLOCKER (DS-0 plan notes #1): gateway /elen/sync/* must use Bearer lnk_ auth,
   * not JWT+X-User-Email. Do not call in prod until gateway repoints these routes.
   */
  async pushBatch(body: SyncPushRequest): Promise<SyncPushResponse> {
    const res = await fetch(`${this.baseUrl()}/elen/sync/push`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Sync push failed (${res.status}): ${errBody}`);
    }
    return res.json() as Promise<SyncPushResponse>;
  }

  /**
   * GET /elen/sync/pull — fetch a page of cloud records since cursor.
   * Throws on non-2xx with body text.
   *
   * BLOCKER (DS-0 plan notes #1): same gateway auth constraint as pushBatch.
   */
  async pullSince(cursor: string | null, limit = 100): Promise<SyncPullResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${this.baseUrl()}/elen/sync/pull?${params}`, {
      method: 'GET',
      headers: this.headers(true)
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Sync pull failed (${res.status}): ${errBody}`);
    }
    return res.json() as Promise<SyncPullResponse>;
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
      headers: this.headers(false),
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
      // localFallback (SQLite) holds both source='local' and source='cloud' rows
      // pulled via SyncEngine.run(). No client-side ACL filter — server already
      // filtered on pull. This is the connected-mode merge path (DS-0 §3.2).
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
