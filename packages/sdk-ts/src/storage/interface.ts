import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';

export interface StorageAdapter {
  saveDecision?(decision: DecisionContext): Promise<void>;
  saveConstraintSet(constraintSet: ConstraintSet): Promise<void>;
  getConstraintSet(id: string): Promise<ConstraintSet | null>;
  saveRecord(record: MinimalDecisionRecord | DecisionRecord): Promise<void>;
  saveLegacyRecord?(record: DecisionRecord): Promise<void>;
  getRecord(recordId: string): Promise<MinimalDecisionRecord | DecisionRecord | null>;
  searchRecords(opts: SearchOptions): Promise<Array<MinimalDecisionRecord | DecisionRecord>>;
  getAgentDecisions(agentId: string, domain?: string): Promise<Array<MinimalDecisionRecord | DecisionRecord>>;
  getCompetencyProfile(agentId: string): Promise<CompetencyProfile>;
}
