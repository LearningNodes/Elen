import type { CompetencyProfile, DecisionRecord, ConstraintSet } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';

export interface StorageAdapter {
  saveConstraintSet(constraintSet: ConstraintSet): Promise<void>;
  getConstraintSet(id: string): Promise<ConstraintSet | null>;
  saveRecord(record: DecisionRecord): Promise<void>;
  getRecord(recordId: string): Promise<DecisionRecord | null>;
  searchRecords(opts: SearchOptions): Promise<DecisionRecord[]>;
  getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]>;
  getCompetencyProfile(agentId: string): Promise<CompetencyProfile>;
}
