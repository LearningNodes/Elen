import type {
  CompetencyProfile,
  ConstraintSet,
  DecisionContext,
  DecisionRecord,
  MinimalDecisionRecord
} from '@learningnodes/elen-core';
import type { SearchOptions, SyncPushItem } from '../types';

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
  logSearch?(query: string, domain: string | undefined, hits: number): Promise<void>;

  /**
   * Optional sync surface — adapters that opt in gain bidirectional cloud sync.
   * Absence of these methods does NOT break memory.ts or other adapters.
   */
  getSyncCursor?(): Promise<string | null>;
  setSyncCursor?(cursor: string): Promise<void>;
  /**
   * Upsert a record pulled from the cloud (source='cloud').
   * Applies status-only and tombstone (withdrawn) updates by decision_id.
   */
  upsertCloudRecord?(item: SyncPushItem): Promise<void>;
  /**
   * Return local (source='local') records with their constraint sets ready for push.
   */
  listLocalRecordsForPush?(): Promise<SyncPushItem[]>;
}
