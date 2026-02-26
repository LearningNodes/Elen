import type { DecisionRecordV0 } from './decision';

export type DecisionStatus = 'active' | 'superseded' | 'withdrawn';

export interface MinimalDecisionRecord {
  decision_id: string;
  q_id: string;
  question_text?: string;
  decision_text: string;
  constraint_set_id: string;
  refs: string[];
  status: DecisionStatus;
  supersedes_id?: string;
  timestamp: string;
  agent_id: string;
  domain: string;
}

export type DecisionRecord = DecisionRecordV0;
export type LegacyDecisionRecord = DecisionRecordV0;
