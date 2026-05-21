import { ElenClient } from './client';
import { CloudMcpStorage } from './storage/cloud-mcp';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import type { ElenConfig, CommitDecisionInput, LogDecisionInput, SearchOptions } from './types';

export class Elen {
  private readonly client: ElenClient;

  constructor(config: ElenConfig) {
    const storage = this.createStorage(config);
    this.client = new ElenClient(config.agentId, storage);
  }

  private createStorage(config: ElenConfig): StorageAdapter {
    if (config.storage === 'cloud') {
      if (!config.apiUrl) {
        throw new Error('Cloud MCP storage requires apiUrl (ELEN_CLOUD_URL)');
      }
      if (!config.userEmail) {
        throw new Error('Cloud MCP storage requires userEmail (ELEN_USER_EMAIL)');
      }
      const localFallback =
        config.sqlitePath != null
          ? new SQLiteStorage(config.sqlitePath, config.projectId, config.defaultProjectIsolation ?? 'strict')
          : undefined;
      return new CloudMcpStorage({
        apiUrl: config.apiUrl,
        userEmail: config.userEmail,
        agentId: config.agentId,
        apiKey: config.apiKey,
        localFallback
      });
    }

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
