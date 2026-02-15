declare module '@learningnodes/elen-core' {
  export type ConstraintType = 'requirement' | 'assumption' | 'boundary';
  export type EvidenceType =
    | 'benchmark'
    | 'test_result'
    | 'documentation'
    | 'precedent'
    | 'observation';
  export type EpistemicType =
    | 'empirical'
    | 'analytical'
    | 'authoritative'
    | 'heuristic'
    | 'precedent';
  export type CheckResult = 'pass' | 'fail' | 'inconclusive';
  export type DecisionStatus = 'draft' | 'asking' | 'validating' | 'validated' | 'rejected';
  export type ValidationTier = 'self' | 'peer' | 'human';

  export interface Constraint {
    constraint_id: string;
    decision_id: string;
    type: ConstraintType;
    description: string;
    source?: string;
    locked: boolean;
  }

  export interface Evidence {
    evidence_id: string;
    decision_id: string;
    type: EvidenceType;
    claim: string;
    proof: string;
    confidence: number;
    source_url?: string;
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
    validator?: string;
  }

  export interface DecisionContext {
    decision_id: string;
    agent_id: string;
    question: string;
    domain: string;
    status: DecisionStatus;
    constraints: Constraint[];
    evidence: Evidence[];
    checks: Check[];
    parent_prompt?: string;
    linked_decisions?: string[];
    created_at: string;
  }

  export interface DecisionRecord {
    record_id: string;
    decision_id: string;
    agent_id: string;
    question: string;
    answer: string;
    constraints_snapshot: Constraint[];
    evidence_snapshot: Evidence[];
    checks_snapshot: Check[];
    confidence: number;
    validated_by?: string;
    validation_type: ValidationTier;
    domain: string;
    tags: string[];
    published_at: string;
    expires_at?: string | null;
  }

  export interface CompetencyProfile {
    agent_id: string;
    domains: string[];
    strengths: string[];
    weaknesses: string[];
    updated_at: string;
  }

  export function classifyEpistemicType(evidence: Evidence): EpistemicType;
  export function canSubmitForValidation(
    decision: DecisionContext
  ): { valid: boolean; errors: string[] };

  export const decisionContextSchema: {
    parse: (value: DecisionContext) => DecisionContext;
  };

  export const decisionRecordSchema: {
    parse: (value: DecisionRecord) => DecisionRecord;
  };
}
