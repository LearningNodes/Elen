import type { Check } from './check';
import type { Constraint } from './constraint';
import type { Evidence } from './evidence';

export type DecisionStatus =
  | 'draft'
  | 'asking'
  | 'validating'
  | 'validated'
  | 'rejected';

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
