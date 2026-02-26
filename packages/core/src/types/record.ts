export type DecisionStatus = 'active' | 'superseded' | 'withdrawn';

export interface DecisionRecord {
  decision_id: string; // Deterministic ID with analytics prefix (e.g. dec:INFA-x7Yp2R)
  q_id: string; // ID of the prompt/question
  decision_text: string; // Short, action-oriented decision
  constraint_set_id: string; // Hash of canonicalized constraint atoms (e.g. cs:8f4a1b...)
  refs: string[]; // Array of reference Pointers (e.g. ["ref:decision/xyz", "ref:artifact/docs.md"])
  status: DecisionStatus;
  supersedes_id?: string; // Pointer to prior decision being replaced
  timestamp: string; // ISO datetime

  // Provenance & Metadata
  agent_id: string;
  domain: string;
}
