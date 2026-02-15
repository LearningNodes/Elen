import type { CompetencyProfile, DecisionRecord, DecisionStatus } from '@learningnodes/elen-core';

export interface ElenConfig {
  agentId: string;
  storage?: 'memory' | 'sqlite';
  sqlitePath?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface LogDecisionInput {
  question: string;
  domain: string;
  parentPrompt?: string;
  constraints: string[];
  evidence: string[];
  linkedPrecedents?: string[];
  answer: string;
  tags?: string[];
  confidence?: number[];
  status?: DecisionStatus;
}

export interface SearchOptions {
  domain?: string;
  minConfidence?: number;
  parentPrompt?: string;
  query?: string;
  limit?: number;
}

export interface SearchPrecedentsOptions {
  limit?: number;
}

export type DecisionRecordResult = DecisionRecord;
export type CompetencyProfileResult = CompetencyProfile;
