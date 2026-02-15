import type { CompetencyProfile, DecisionContext, DecisionRecord } from '@learningnodes/elen-core';
import type { SearchOptions } from '../types';

export interface StorageAdapter {
  saveDecision(context: DecisionContext): Promise<void>;
  saveRecord(record: DecisionRecord): Promise<void>;
  getRecord(recordId: string): Promise<DecisionRecord | null>;
  searchRecords(opts: SearchOptions): Promise<DecisionRecord[]>;
  getAgentDecisions(agentId: string, domain?: string): Promise<DecisionRecord[]>;
  getCompetencyProfile(agentId: string): Promise<CompetencyProfile>;
}
