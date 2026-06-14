import { ElenClient } from './client';
import { CloudMcpStorage } from './storage/cloud-mcp';
import { InMemoryStorage, SQLiteStorage, type StorageAdapter } from './storage';
import { SyncEngine } from './sync/sync-engine';
import type { CommitDecisionInput, ElenConfig, LogDecisionInput, SearchOptions, SyncPushResponse } from './types';
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
      const resolvedUrl = config.apiUrl ?? config.cloudBaseUrl;
      if (!resolvedUrl) {
        throw new Error('Cloud MCP storage requires apiUrl or cloudBaseUrl (ELEN_CLOUD_URL)');
      }
      // apiKey auth is primary for sync; userEmail is optional/legacy for /elen/mcp/commit
      const localFallback =
        config.sqlitePath != null
          ? new SQLiteStorage(config.sqlitePath, config.projectId, config.defaultProjectIsolation ?? 'strict')
          : undefined;
      return new CloudMcpStorage({
        apiUrl: resolvedUrl,
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

  /**
   * Full bidirectional sync — pull cloud records into local SQLite, then push
   * local records to cloud. Requires storage='cloud' with sqlitePath set.
   *
   * BLOCKER: gateway /elen/sync/* must use Bearer lnk_ auth before this is live.
   * ELEN_API_KEY and ELEN_CLOUD_API_KEY are both accepted (alias via config.apiKey).
   */
  async sync(): Promise<{
    pull: { upserted: number; pages: number };
    push: SyncPushResponse;
  }> {
    const engine = this.requireSyncEngine();
    return engine.run();
  }

  /** Push local records to cloud only. */
  async push(): Promise<SyncPushResponse> {
    const engine = this.requireSyncEngine();
    return engine.push();
  }

  /** Pull cloud records into local SQLite only. */
  async pull(): Promise<{ upserted: number; pages: number }> {
    const engine = this.requireSyncEngine();
    return engine.pull();
  }

  private requireSyncEngine(): SyncEngine {
    if (!(this.storage instanceof CloudMcpStorage)) {
      throw new Error('Sync requires storage="cloud" with a CloudMcpStorage instance');
    }
    const local = (this.storage as CloudMcpStorage & { opts: { localFallback?: StorageAdapter } });
    // Access localFallback — CloudMcpStorage opts are private; cast via any
    const localFallback = (this.storage as any).opts?.localFallback as SQLiteStorage | undefined;
    if (!(localFallback instanceof SQLiteStorage)) {
      throw new Error('Sync requires sqlitePath set on cloud storage config');
    }
    return new SyncEngine({ cloud: this.storage as CloudMcpStorage, local: localFallback });
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
export * from './sync/content-hash';
export * from './sync/sync-engine';
