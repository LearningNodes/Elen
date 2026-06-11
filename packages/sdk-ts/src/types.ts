import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionRecord,
  DecisionStatus,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';

export interface ElenConfig {
  agentId: string;
  projectId?: string;
  storage?: 'memory' | 'sqlite' | 'cloud';
  sqlitePath?: string;
  apiUrl?: string;
  /**
   * Primary auth credential for cloud sync (Bearer lnk_ key from /settings/api-keys).
   * Also accepted as ELEN_API_KEY or ELEN_CLOUD_API_KEY env var.
   */
  apiKey?: string;
  /** Alias for apiUrl — accepted for forward-compat. */
  cloudBaseUrl?: string;
  /**
   * LN identity email for X-User-Email header.
   * Optional / legacy — used only for /elen/mcp/commit attribution.
   * Cloud sync routes authenticate via apiKey (Bearer lnk_) only.
   */
  userEmail?: string;
  defaultProjectIsolation?: 'strict' | 'open';
}

/* ── Sync wire types (DS-0 §6.4) ──────────────────────────────────── */

/** Single record payload sent in a push batch (matches server sync.js pushBatch item shape). */
export interface SyncPushItem {
  decision_id: string;
  q_id: string;
  question_text?: string | null;
  decision_text: string;
  constraint_set_id: string;
  /** Flat string array of constraint atoms — server upserts into mcp_constraint_sets. */
  constraints?: string[];
  domain: string;
  agent_id: string;
  refs: string[];
  status: string;
  /** 'withdraw' op triggers tombstone path on server. */
  op?: string;
  supersedes_id?: string | null;
  timestamp: string;
  content_hash: string;
}

/** POST /elen/sync/push request body — server reads req.body.items. */
export interface SyncPushRequest {
  items: SyncPushItem[];
}

/** Per-record outcome in push response — server field is `status`, not `result`. */
export interface SyncPushResultItem {
  decision_id: string;
  /** Server values: 'created' | 'duplicate' | 'withdrawn' | 'error' */
  status: 'created' | 'duplicate' | 'withdrawn' | 'error';
  error?: string;
}

/** POST /elen/sync/push response body. */
export interface SyncPushResponse {
  results: SyncPushResultItem[];
}

/** GET /elen/sync/pull response body — server field is `rows`, not `records`. No `has_more`. */
export interface SyncPullResponse {
  rows: SyncPushItem[];
  next_cursor: string | null;
}

export interface CommitDecisionInput {
  question: string;
  domain: string;
  decisionText: string;
  constraints: string[];
  refs?: string[];
  status?: DecisionStatus;
  supersedesId?: string;
  /** Skip near-duplicate check (use after reviewing similar_candidates). */
  force?: boolean;
}

export interface LogDecisionInput {
  question: string;
  domain: string;
  constraints: string[];
  evidence: string[];
  confidence?: number[];
  answer: string;
  parentPrompt?: string;
  linkedPrecedents?: string[];
}

export interface SearchOptions {
  domain?: string;
  projectId?: string;
  includeShared?: boolean;
  query?: string;
  limit?: number;
  minConfidence?: number;
  parentPrompt?: string;
}

export interface SearchPrecedentsOptions {
  limit?: number;
}

export interface ContextThread {
  domain: string;
  count: number;
  latest_timestamp: string;
  decisions: Array<{ decision_id: string; question_text?: string; decision_text: string; status: string; timestamp: string }>;
}

export interface ProjectCount {
  project_id: string;
  count: number;
}

export interface GraphMeta {
  agent_id: string;
  project_id: string;
  db_path: string;
  total: number;
  active: number;
  superseded: number;
  projects: ProjectCount[];
  hint?: string;
}

export interface GetContextResult {
  threads: ContextThread[];
  meta: GraphMeta;
}

export interface CommitDecisionResult {
  committed?: MinimalDecisionRecord;
  blocked?: boolean;
  similar_candidates?: Array<{
    decision_id: string;
    question_text?: string;
    decision_text: string;
    domain: string;
    status: string;
    score: number;
  }>;
  message?: string;
}

export interface GraphStats extends GraphMeta {
  agents: Array<{ agent_id: string; count: number }>;
  duplicate_candidates: Array<{ decision_ids: string[]; score: number }>;
}

export interface ConsolidateResult {
  clusters: Array<{ topic: string; decision_ids: string[]; reason: string }>;
  suggestions: Array<{
    kind: string;
    decision_ids: string[];
    message: string;
    proposed_action: string;
  }>;
  meta: GraphMeta;
}

export type DecisionRecordResult = DecisionRecord;
export type CompetencyProfileResult = CompetencyProfile;
export type ExpandedDecision = { record: DecisionRecord; constraints: ConstraintSet };
