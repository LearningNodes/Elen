export type EvidenceType =
  | 'benchmark'
  | 'test_result'
  | 'documentation'
  | 'precedent'
  | 'observation';

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
