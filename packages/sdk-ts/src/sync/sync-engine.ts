import type { CloudMcpStorage } from '../storage/cloud-mcp';
import type { SQLiteStorage } from '../storage/sqlite';
import type { SyncPushItem, SyncPushResponse, SyncPullResponse } from '../types';

export interface SyncEngineOptions {
  cloud: CloudMcpStorage;
  local: SQLiteStorage;
  /** Pull page size. Default 100. */
  pullLimit?: number;
}

/**
 * SyncEngine — bidirectional sync of mcp_decisions (DS-0 §6).
 *
 * run() pulls all pages from cloud (persisting cursor after each page),
 * then pushes outstanding local records.
 *
 * Auth: all network calls go through CloudMcpStorage which injects Bearer
 * ELEN_API_KEY. No email/workspace fields are sent on the wire for sync routes.
 *
 * BLOCKER (plan notes #1): gateway /elen/sync/* must use Bearer lnk_ auth,
 * not JWT+X-User-Email. Do not activate in prod until confirmed.
 */
export class SyncEngine {
  private readonly cloud: CloudMcpStorage;
  private readonly local: SQLiteStorage;
  private readonly pullLimit: number;

  constructor(opts: SyncEngineOptions) {
    this.cloud = opts.cloud;
    this.local = opts.local;
    this.pullLimit = opts.pullLimit ?? 100;
  }

  /**
   * Build the push batch payload from local records.
   * Exported so callers can inspect the batch before pushing.
   */
  async buildPushBatch(): Promise<SyncPushItem[]> {
    return this.local.listLocalRecordsForPush();
  }

  /**
   * Pull all pages from the cloud, persisting cursor and upserting each page
   * into the local SQLite store.
   *
   * Returns the total number of records upserted.
   */
  async pull(): Promise<{ upserted: number; pages: number }> {
    let cursor = await this.local.getSyncCursor();
    let upserted = 0;
    let pages = 0;

    while (true) {
      const page: SyncPullResponse = await this.cloud.pullSince(cursor, this.pullLimit);
      pages += 1;

      for (const item of page.records) {
        await this.local.upsertCloudRecord(item);
        upserted += 1;
      }

      if (page.next_cursor) {
        cursor = page.next_cursor;
        await this.local.setSyncCursor(cursor);
      }

      if (!page.has_more) break;
    }

    // Persist final cursor even if has_more=false (server may advance it)
    if (cursor) {
      await this.local.setSyncCursor(cursor);
    }

    return { upserted, pages };
  }

  /**
   * Push local records to the cloud.
   * Idempotent via content_hash — server returns 'duplicate' for already-synced rows.
   *
   * Returns the raw push response.
   */
  async push(): Promise<SyncPushResponse> {
    const records = await this.buildPushBatch();
    if (records.length === 0) {
      return { results: [] };
    }
    return this.cloud.pushBatch({ records });
  }

  /**
   * Full sync: pull (all pages) then push.
   */
  async run(): Promise<{
    pull: { upserted: number; pages: number };
    push: SyncPushResponse;
  }> {
    const pullResult = await this.pull();
    const pushResult = await this.push();
    return { pull: pullResult, push: pushResult };
  }
}
