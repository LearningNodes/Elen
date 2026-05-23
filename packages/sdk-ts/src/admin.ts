import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { openSqliteDatabase } from './sqlite-open';

export function autoBackupPath(dbPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dirname(dbPath), `decisions.backup.${stamp}.db`);
}

/** WAL checkpoint + file copy. Returns destination path. */
export function backupDatabase(dbPath: string, destPath?: string): string {
  const target = destPath ?? autoBackupPath(dbPath);
  mkdirSync(dirname(target), { recursive: true });
  const db = openSqliteDatabase(dbPath);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  copyFileSync(dbPath, target);
  const wal = `${dbPath}-wal`;
  const shm = `${dbPath}-shm`;
  if (existsSync(wal)) copyFileSync(wal, `${target}-wal`);
  if (existsSync(shm)) copyFileSync(shm, `${target}-shm`);
  return target;
}

export interface ExportBundle {
  version: 1;
  exported_at: string;
  records: unknown[];
  constraint_sets: unknown[];
  decisions: unknown[];
}

export function exportDatabase(db: Database.Database): ExportBundle {
  const records = db.prepare('SELECT payload_json FROM records').all() as Array<{ payload_json: string }>;
  const constraint_sets = db.prepare('SELECT * FROM constraint_sets').all();
  const decisions = db.prepare('SELECT decision_json FROM decisions').all() as Array<{ decision_json: string }>;
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    records: records.map((r) => JSON.parse(r.payload_json)),
    constraint_sets,
    decisions: decisions.map((d) => JSON.parse(d.decision_json))
  };
}

export function importDatabase(db: Database.Database, bundle: ExportBundle): { records: number } {
  if (bundle.version !== 1) throw new Error(`Unsupported export version: ${bundle.version}`);
  let count = 0;
  const insert = db.prepare(`
    INSERT OR REPLACE INTO records(
      record_id, decision_id, q_id, agent_id, domain, project_id,
      question_text, decision_text, constraint_set_id,
      refs, status, supersedes_id, timestamp, payload_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const tx = db.transaction((items: unknown[]) => {
    for (const raw of items) {
      const r = raw as Record<string, unknown>;
      const recordId = (r.record_id ?? r.decision_id) as string;
      insert.run([
        recordId,
        r.decision_id,
        r.q_id ?? '',
        r.agent_id,
        r.domain,
        r.project_id ?? 'default',
        r.question_text ?? r.question ?? null,
        r.decision_text ?? r.answer,
        r.constraint_set_id ?? '',
        JSON.stringify(r.refs ?? []),
        r.status ?? 'active',
        r.supersedes_id ?? null,
        r.timestamp ?? r.published_at ?? new Date().toISOString(),
        JSON.stringify(raw)
      ]);
      count += 1;
    }
  });
  tx(bundle.records);
  return { records: count };
}
