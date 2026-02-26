import type { CompetencyProfile, DecisionRecord, DecisionStatus, ConstraintSet } from '@learningnodes/elen-core';

export interface ElenConfig {
  agentId: string;
  projectId?: string;
  storage?: 'memory' | 'sqlite';
  sqlitePath?: string;
  apiUrl?: string;
  apiKey?: string;
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

export interface SearchOptions {
  domain?: string;
  projectId?: string;
  includeShared?: boolean;
  query?: string;
  limit?: number;
}

export interface SearchPrecedentsOptions {
  limit?: number;
}

export type DecisionRecordResult = DecisionRecord;
export type CompetencyProfileResult = CompetencyProfile;
