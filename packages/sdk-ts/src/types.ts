import type { CompetencyProfile, DecisionRecord, DecisionStatus, ConstraintSet } from '@learningnodes/elen-core';

export interface ElenConfig {
  agentId: string;
  projectId?: string;
  storage?: 'memory' | 'sqlite';
  sqlitePath?: string;
  apiUrl?: string;
  apiKey?: string;
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

export type DecisionRecordResult = DecisionRecord;
export type CompetencyProfileResult = CompetencyProfile;
export type ExpandedDecision = { record: DecisionRecord; constraints: ConstraintSet };
