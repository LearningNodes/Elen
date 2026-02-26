export type DecisionLifecycleStatus = 'draft' | 'validating' | 'validated' | 'rejected';
export type ConstraintType = 'requirement' | 'assumption' | 'risk' | 'dependency';
export type EvidenceType =
  | 'benchmark'
  | 'test_result'
  | 'documentation'
  | 'observation'
  | 'precedent'
  | 'analysis';

export type CheckResult = 'pass' | 'fail' | 'inconclusive';
export type EpistemicType =
  | 'empirical'
  | 'authoritative'
  | 'precedent'
  | 'heuristic'
  | 'analytical';

export interface Constraint {
  constraint_id: string;
  decision_id: string;
  type: ConstraintType;
  description: string;
  locked: boolean;
}

export interface Evidence {
  evidence_id: string;
  decision_id: string;
  type: EvidenceType;
  claim: string;
  proof: string;
  confidence: number;
  linked_precedent?: string;
}

export interface Check {
  check_id: string;
  decision_id: string;
  claim: string;
  result: CheckResult;
  evidence_ids: string[];
  epistemic_type: EpistemicType;
  confidence: number;
  linked_precedent?: string;
}

export interface DecisionContext {
  decision_id: string;
  agent_id: string;
  question: string;
  domain: string;
  status: DecisionLifecycleStatus;
  constraints: Constraint[];
  evidence: Evidence[];
  checks: Check[];
  created_at: string;
  parent_prompt?: string;
}

export type ValidationType = 'self' | 'peer' | 'human';

export interface DecisionRecordV0 {
  record_id: string;
  decision_id: string;
  agent_id: string;
  question: string;
  answer: string;
  constraints_snapshot: Constraint[];
  evidence_snapshot: Evidence[];
  checks_snapshot: Check[];
  confidence: number;
  validation_type: ValidationType;
  domain: string;
  tags: string[];
  published_at: string;
  expires_at?: string | null;
}

export const DEFAULT_DECISION_TTL_HOURS = 72;

export const VALIDATION_TIER_WEIGHTS = {
  self: 0.3,
  peer: 0.7,
  human: 1
} as const;
