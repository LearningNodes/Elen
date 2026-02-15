export type EpistemicType =
  | 'empirical'
  | 'analytical'
  | 'authoritative'
  | 'heuristic'
  | 'precedent';

export type CheckResult = 'pass' | 'fail' | 'inconclusive';

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
