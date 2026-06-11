import type { CloudMcpStorage } from '../storage/cloud-mcp';
import type { SQLiteStorage } from '../storage/sqlite';
import type { SyncPushItem, SyncPushResponse, SyncPullResponse, SyncPushResultItem } from '../types';

export interface SyncEngineOptions {
  cloud: CloudMcpStorage;
  local: SQLiteStorage;
  /** Pull page size. Default 100. */
  pullLimit?: number;
  /**
   * Maximum number of records per push chunk. Default 20.
   *
   * Constraint sets referenced by records in a chunk travel in the same chunk
   * or an earlier one — the chunker keeps records with the same constraint_set_id
   * together unless the chunk is already at capacity, in which case the new
   * constraint_set_id starts the next chunk.
   */
  pushChunkSize?: number;
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
  private readonly pushChunkSize: number;

  constructor(opts: SyncEngineOptions) {
    this.cloud = opts.cloud;
    this.local = opts.local;
    this.pullLimit = opts.pullLimit ?? 100;
    this.pushChunkSize = opts.pushChunkSize ?? 20;
  }

  /**
   * Topologically sort records so that a superseded target always appears before
   * its superseder in the output array.
   *
   * Algorithm:
   *   - Build an index of decision_id → position in the input array.
   *   - Walk the array left-to-right.  When a record's supersedes_id refers to
   *     another record in the push set that sits AFTER the current position,
   *     splice that target record out and insert it immediately before the
   *     current record (hoist).
   *   - Repeat until no more hoists are required.  Cycles are impossible by
   *     construction (supersedes is a DAG), but the loop is bounded by the
   *     array length squared as a safety guard.
   *
   * Records whose supersedes_id target is NOT in the push set are left unchanged.
   */
  static sortByDependencyOrder(records: SyncPushItem[]): SyncPushItem[] {
    const result = [...records];

    // Track which decision_ids are in the push set
    const inSet = new Set(result.map((r) => r.decision_id));

    let changed = true;
    let guardIterations = result.length * result.length + 1;

    while (changed && guardIterations-- > 0) {
      changed = false;
      for (let i = 0; i < result.length; i++) {
        const supersedes = result[i].supersedes_id;
        if (!supersedes || !inSet.has(supersedes)) continue;

        // Find where the target currently sits
        const targetIdx = result.findIndex((r) => r.decision_id === supersedes);
        if (targetIdx === -1 || targetIdx < i) continue; // already before us

        // Hoist: remove target from its current position, insert before i
        const [target] = result.splice(targetIdx, 1);
        result.splice(i, 0, target);
        changed = true;
        break; // restart the scan after mutating
      }
    }

    return result;
  }

  /**
   * Build the push batch payload from local records.
   *
   * listLocalRecordsForPush returns rows ordered chronologically ascending
   * (oldest first), stable-tiebroken by decision_id.  After retrieval a
   * dependency pass ensures that any record whose supersedes_id refers to
   * another record in the push set is positioned after its target.
   *
   * Exported so callers can inspect the batch before pushing.
   */
  async buildPushBatch(): Promise<SyncPushItem[]> {
    const records = await this.local.listLocalRecordsForPush();
    return SyncEngine.sortByDependencyOrder(records);
  }

  /**
   * Partition records into chunks of at most `pushChunkSize`.
   *
   * Constraint-set cohesion rule: all records sharing a constraint_set_id must
   * travel in the same chunk or an earlier one.  The algorithm walks records in
   * order and tracks which constraint_set_ids have already been opened.  If the
   * current record's constraint_set_id is new AND the current chunk is full, it
   * forces a new chunk boundary.  If the constraint_set_id is already in an
   * earlier chunk, that chunk has already been (or will be) sent before this
   * one, so the record can join the current chunk regardless.
   */
  partitionChunks(records: SyncPushItem[]): SyncPushItem[][] {
    if (records.length === 0) return [];

    const chunks: SyncPushItem[][] = [];
    let current: SyncPushItem[] = [];
    // Maps constraint_set_id → chunk index where it was first seen
    const csChunkIndex = new Map<string, number>();

    for (const record of records) {
      const csId = record.constraint_set_id;
      const seenInChunk = csChunkIndex.get(csId);
      const currentChunkIndex = chunks.length;

      if (seenInChunk === undefined) {
        // New constraint_set_id: start a new chunk if current is full
        if (current.length >= this.pushChunkSize) {
          chunks.push(current);
          current = [];
        }
        csChunkIndex.set(csId, chunks.length);
      }
      // If seenInChunk is defined (earlier chunk) the record can join current chunk freely;
      // if it equals chunks.length (same chunk) that's also fine — no boundary needed.

      // Check if simply adding to current would overflow (irrespective of cs cohesion)
      if (current.length >= this.pushChunkSize) {
        chunks.push(current);
        current = [];
      }

      current.push(record);
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
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

      for (const item of page.rows) {
        await this.local.upsertCloudRecord(item);
        upserted += 1;
      }

      if (page.next_cursor) {
        cursor = page.next_cursor;
        await this.local.setSyncCursor(cursor);
      }

      // Server returns next_cursor=null when there are no more pages
      if (!page.next_cursor) break;
    }

    // Persist final cursor even if has_more=false (server may advance it)
    if (cursor) {
      await this.local.setSyncCursor(cursor);
    }

    return { upserted, pages };
  }

  /**
   * Push local records to the cloud in chunks of at most `pushChunkSize`.
   *
   * Each chunk is sent as a separate POST /elen/sync/push request, keeping
   * individual request bodies below the server's body-size limit (100 kB).
   *
   * On HTTP failure the push stops immediately.  The error message includes
   * which chunk failed and how many records were already accepted, so the
   * caller can surface partial progress.  Re-running is safe: content-hash
   * dedup on the server means accepted records will come back as 'duplicate'.
   *
   * Returns an aggregated {results} across all chunks.
   */
  async push(): Promise<SyncPushResponse> {
    const records = await this.buildPushBatch();
    if (records.length === 0) {
      return { results: [] };
    }

    const chunks = this.partitionChunks(records);
    const allResults: SyncPushResultItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let chunkResponse: SyncPushResponse;

      try {
        chunkResponse = await this.cloud.pushBatch({ items: chunk });
      } catch (err) {
        const alreadyAccepted = allResults.filter((r) => r.status === 'created' || r.status === 'duplicate').length;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Push failed on chunk ${i + 1}/${chunks.length} (records ${allResults.length + 1}–${allResults.length + chunk.length} of ${records.length}). ` +
            `${alreadyAccepted} record(s) already accepted — re-running is safe (content-hash dedup makes it idempotent). ` +
            `Underlying error: ${msg}`
        );
      }

      allResults.push(...chunkResponse.results);
    }

    return { results: allResults };
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
