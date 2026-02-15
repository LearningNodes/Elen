import { ElenClient } from './client';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import type { ElenConfig, LogDecisionInput, SearchOptions } from './types';

export class Elen {
  private readonly client: ElenClient;

  constructor(config: ElenConfig) {
    const storage = this.createStorage(config);
    this.client = new ElenClient(config.agentId, storage);
  }

  private createStorage(config: ElenConfig): StorageAdapter {
    if (config.storage === 'sqlite') {
      return new SQLiteStorage(config.sqlitePath ?? 'elen.db');
    }

    return new InMemoryStorage();
  }

  async logDecision(input: LogDecisionInput) {
    return this.client.logDecision(input);
  }

  async searchRecords(opts: SearchOptions) {
    return this.client.searchRecords(opts);
  }

  async searchPrecedents(query: string) {
    return this.client.searchPrecedents(query);
  }

  async getCompetencyProfile() {
    return this.client.getCompetencyProfile();
  }
}

export * from './client';
export * from './id';
export * from './storage';
export * from './types';
