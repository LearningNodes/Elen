import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { CommitDecisionInput, CommitDecisionResult, SearchOptions } from '../types';
import type { StorageAdapter } from './interface';
import { CloudMcpStorage, type CloudMcpStorageOptions } from './cloud-mcp';

export interface CloudV2StorageOptions extends CloudMcpStorageOptions {
  /** Client name sent as X-Elen-Client (manual keys / hosted). */
  clientName?: string;
  /**
   * When true: no local fallback, no file access (hosted mode).
   * Network/5xx errors surface; never silent local write.
   */
  cloudOnly?: boolean;
}

/**
 * Cloud storage against K4 `/elen/v2` routes.
 * Connected mode: explicit *V2 methods for the eight K6 tools; local reads for
 * get_context / consolidate / competency (do not override searchRecords globally).
 */
export class CloudV2Storage extends CloudMcpStorage implements StorageAdapter {
  private readonly v2opts: CloudV2StorageOptions;

  constructor(opts: CloudV2StorageOptions) {
    const localFallback = opts.cloudOnly ? undefined : opts.localFallback;
    super({ ...opts, localFallback });
    this.v2opts = { ...opts, localFallback };
  }

  setClientName(name: string): void {
    this.v2opts.clientName = name;
  }

  private v2Headers(): Record<string, string> {
    // X-Agent-Id stays the process agent id; per-call agent goes only in the body (FX-3).
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-Id': this.v2opts.agentId
    };
    if (this.v2opts.apiKey) {
      h.Authorization = `Bearer ${this.v2opts.apiKey}`;
    }
    if (this.v2opts.clientName) {
      h['X-Elen-Client'] = this.v2opts.clientName;
    }
    return h;
  }

  private base(): string {
    return this.v2opts.apiUrl.replace(/\/$/, '');
  }

  private async v2Fetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${this.base()}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort')) {
        throw Object.assign(new Error('Elen cloud request timed out after 15s'), {
          status: 0,
          error: 'timeout',
          message: msg
        });
      }
      throw new Error(`Elen cloud unreachable: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 200 && res.status < 300) {
      return res;
    }

    let serverError = 'error';
    let serverMessage = '';
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      serverError = parsed.error || serverError;
      serverMessage = parsed.message || text;
    } catch {
      serverMessage = text || res.statusText;
    }
    const err = new Error(`Elen cloud error (${res.status}): ${serverError}${serverMessage ? ` — ${serverMessage}` : ''}`);
    Object.assign(err, { status: res.status, error: serverError, message: serverMessage || err.message });
    throw err;
  }

  async commitV2(input: CommitDecisionInput): Promise<CommitDecisionResult> {
    const res = await this.v2Fetch('/elen/v2/decisions', {
      method: 'POST',
      headers: this.v2Headers(),
      body: JSON.stringify({
        question: input.question,
        domain: input.domain,
        decisionText: input.decisionText,
        constraints: input.constraints,
        refs: input.refs,
        force: input.force,
        evidence: input.evidence,
        agent: input.agent,
        questionId: input.questionId
      })
    });
    return (await res.json()) as CommitDecisionResult;
  }

  async supersedeV2(oldId: string, input: CommitDecisionInput): Promise<CommitDecisionResult> {
    const res = await this.v2Fetch(`/elen/v2/decisions/${encodeURIComponent(oldId)}/supersede`, {
      method: 'POST',
      headers: this.v2Headers(),
      body: JSON.stringify({
        question: input.question,
        domain: input.domain,
        decisionText: input.decisionText,
        constraints: input.constraints,
        refs: input.refs,
        evidence: input.evidence,
        agent: input.agent
      })
    });
    return (await res.json()) as CommitDecisionResult;
  }

  async searchV2(opts: SearchOptions & { includeSuperseded?: boolean }) {
    const params = new URLSearchParams();
    params.set('q', opts.query || '');
    if (opts.domain) params.set('domain', opts.domain);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.includeSuperseded) params.set('include_superseded', 'true');
    const res = await this.v2Fetch(`/elen/v2/decisions/search?${params}`, {
      method: 'GET',
      headers: this.v2Headers()
    });
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    return (body.results || []).map((r) => ({
      decision_id: r.decision_id as string,
      status: r.status as string,
      decision_text: r.decision_text as string,
      question_text: r.question_text as string | undefined,
      constraint_set_id: r.constraint_set_id as string | undefined,
      refs: r.refs as string[] | undefined,
      supersedes_id: r.supersedes_id as string | null | undefined,
      ...r
    }));
  }

  async getV2(id: string) {
    try {
      const res = await this.v2Fetch(`/elen/v2/decisions/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: this.v2Headers()
      });
      return res.json() as Promise<{
        record: MinimalDecisionRecord;
        constraints: ConstraintSet & { atoms: string[]; summary?: string };
        history?: unknown[];
      }>;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async listV2(opts: {
    agent?: string;
    domain?: string;
    since?: string;
    status?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (opts.agent) params.set('agent', opts.agent);
    if (opts.domain) params.set('domain', opts.domain);
    if (opts.since) params.set('since', opts.since);
    if (opts.status) params.set('status', opts.status);
    if (opts.limit) params.set('limit', String(opts.limit));
    const res = await this.v2Fetch(`/elen/v2/decisions?${params}`, {
      method: 'GET',
      headers: this.v2Headers()
    });
    return res.json() as Promise<{ results: unknown[]; next_before: string | null }>;
  }

  async statusV2() {
    const res = await this.v2Fetch('/elen/v2/status', {
      method: 'GET',
      headers: this.v2Headers()
    });
    return res.json();
  }

  // Connected mode: keep local reads for tools that are not routed to v2.
  override async searchRecords(opts: SearchOptions = {}): Promise<Array<MinimalDecisionRecord | DecisionRecord>> {
    if (this.v2opts.cloudOnly) {
      const results = await this.searchV2(opts);
      return results as unknown as MinimalDecisionRecord[];
    }
    if (this.v2opts.localFallback) {
      return this.v2opts.localFallback.searchRecords(opts);
    }
    return [];
  }

  override async getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null> {
    if (this.v2opts.cloudOnly) {
      const full = await this.getV2(recordId);
      return full?.record ?? null;
    }
    if (this.v2opts.localFallback) {
      return this.v2opts.localFallback.getRecord(recordId);
    }
    return null;
  }

  override async saveRecord(_record: MinimalDecisionRecord | DecisionRecord): Promise<void> {
    if (this.v2opts.cloudOnly) {
      throw new Error('Cloud-only storage: use commitV2, do not write locally');
    }
    throw new Error('Connected v2 mode: commits must use commitV2');
  }

  override async saveDecision(_decision: DecisionContext): Promise<void> {
    if (this.v2opts.cloudOnly) {
      throw new Error('Cloud-only storage: no local decision writes');
    }
  }

  override async getCompetencyProfile(agentId: string): Promise<CompetencyProfile> {
    if (this.v2opts.localFallback) {
      return this.v2opts.localFallback.getCompetencyProfile(agentId);
    }
    return {
      agent_id: agentId,
      domains: [],
      strengths: [],
      weaknesses: [],
      updated_at: new Date().toISOString()
    };
  }
}

export function isCloudV2Storage(s: StorageAdapter): s is CloudV2Storage {
  return s instanceof CloudV2Storage;
}
