import type { Check } from './check';
import type { Constraint } from './constraint';
import type { Evidence } from './evidence';

export type ValidationTier = 'self' | 'peer' | 'human';

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
