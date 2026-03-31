import { ElenClient } from './client';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import type { ElenConfig, CommitDecisionInput, LogDecisionInput, SearchOptions } from './types';

export class Elen {
  private readonly client: ElenClient;

  constructor(config: ElenConfig) {
    const storage = this.createStorage(config);
    this.client = new ElenClient(config.agentId, storage);
  }

  private createStorage(config: ElenConfig): StorageAdapter {
    if (config.storage === 'sqlite') {
      return new SQLiteStorage(config.sqlitePath ?? 'elen.db', config.projectId, config.defaultProjectIsolation ?? 'strict');
    }

    return new InMemoryStorage();
  }

  async logDecision(input: LogDecisionInput) {
    return this.client.logDecision(input);
  }

  async commitDecision(input: CommitDecisionInput) {
    return this.client.commitDecision(input);
  }

  async supersedeDecision(oldDecisionId: string, input: CommitDecisionInput) {
    return this.client.supersedeDecision(oldDecisionId, input);
  }

  async searchRecords(opts: SearchOptions) {
    return this.client.searchRecords(opts);
  }

  async searchPrecedents(query: string, opts: SearchOptions = {}) {
    return this.client.searchPrecedents(query, opts);
  }

  async suggest(opts: SearchOptions) {
    return this.client.suggest(opts);
  }

  async expand(decisionId: string) {
    return this.client.expand(decisionId);
  }

  async getCompetencyProfile() {
    return this.client.getCompetencyProfile();
  }

  async getContext(opts?: { domain?: string; limit?: number }) {
    return this.client.getContext(opts);
  }
}

export * from './client';
export * from './id';
export * from './storage';
export * from './types';
