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
  apiKey?: string;
  /** Required when storage is 'cloud' — LN identity for X-User-Email attribution. */
  userEmail?: string;
  defaultProjectIsolation?: 'strict' | 'open';
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
