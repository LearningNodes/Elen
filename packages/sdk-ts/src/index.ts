import { ElenClient } from './client';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import type { ElenConfig, CommitDecisionInput, SearchOptions } from './types';

export class Elen {
  private readonly client: ElenClient;

  constructor(config: ElenConfig) {
    const storage = this.createStorage(config);
    this.client = new ElenClient(config.agentId, storage);
  }

  private createStorage(config: ElenConfig): StorageAdapter {
    if (config.storage === 'sqlite') {
      return new SQLiteStorage(config.sqlitePath ?? 'elen.db', config.projectId);
    }

    return new InMemoryStorage();
  }

  async commitDecision(input: CommitDecisionInput) {
    return this.client.commitDecision(input);
  }

  async supersedeDecision(oldDecisionId: string, input: CommitDecisionInput) {
    return this.client.supersedeDecision(oldDecisionId, input);
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
}

export * from './client';
export * from './id';
export * from './storage';
export * from './types';
