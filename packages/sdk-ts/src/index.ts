import { ElenClient } from './client';
import { CloudMcpStorage } from './storage/cloud-mcp';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import type { CommitDecisionInput, ElenConfig, LogDecisionInput, SearchOptions } from './types';
import type { ExportBundle } from './admin';

export class Elen {
  private readonly client: ElenClient;
  private readonly storage: StorageAdapter;
  private readonly agentId: string;

  constructor(config: ElenConfig) {
    this.agentId = config.agentId;
    this.storage = this.createStorage(config);
    this.client = new ElenClient(config.agentId, this.storage);
  }

  private requireSqlite(): SQLiteStorage {
    if (!(this.storage instanceof SQLiteStorage)) {
      throw new Error('This operation requires local SQLite storage');
    }
    return this.storage;
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

  getStatus() {
    return this.client.getStatus();
  }

  async consolidate() {
    return this.client.consolidateSuggest();
  }

  getStats() {
    return this.client.getStats();
  }

  renameProject(oldId: string, newId: string, opts?: { backup?: boolean }) {
    const db = this.requireSqlite();
    if (opts?.backup !== false) db.backup();
    return db.renameProject(oldId, newId);
  }

  mergeProjects(sourceIds: string[], destId: string, opts?: { backup?: boolean }) {
    const db = this.requireSqlite();
    if (opts?.backup !== false) db.backup();
    return db.mergeProjects(sourceIds, destId);
  }

  prune(opts?: { project?: string; backup?: boolean }) {
    const db = this.requireSqlite();
    if (opts?.backup !== false) db.backup();
    return db.pruneBlank(opts?.project);
  }

  backup(destPath?: string) {
    return this.requireSqlite().backup(destPath);
  }

  exportJson(): ExportBundle {
    return this.requireSqlite().exportJson();
  }

  importJson(bundle: ExportBundle) {
    const db = this.requireSqlite();
    db.backup();
    return db.importJson(bundle);
  }

  close(): void {
    if (this.storage instanceof SQLiteStorage) {
      this.storage.close();
    }
  }
}

export * from './client';
export * from './id';
export * from './storage';
export * from './types';
export * from './project-resolve';
export * from './similarity';
export * from './sqlite-open';
export type { ExportBundle } from './admin';
