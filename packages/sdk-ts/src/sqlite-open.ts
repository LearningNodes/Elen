import type Database from 'better-sqlite3';

/** Open native SQLite with WAL + busy timeout for multi-client safety. */
export function configureSqliteDatabase(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
}

type DatabaseConstructor = new (path: string) => Database.Database;

/**
 * Load better-sqlite3 with an actionable ABI mismatch message.
 * Migrate to node:sqlite once all clients are on Node 22+.
 */
export function loadBetterSqlite3(): DatabaseConstructor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('better-sqlite3');
    return (mod.default ?? mod) as DatabaseConstructor;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const abiHint =
      /NODE_MODULE_VERSION|was compiled against|different Node/i.test(msg) ||
      /Could not locate the bindings file|invalid ELF header/i.test(msg);
    if (abiHint) {
      const running = process.version;
      throw new Error(
        `Elen could not load the native SQLite driver (built for a different Node ABI than ${running}). ` +
          `Run \`npx @learningnodes/elen-mcp@latest\` so npm installs a binary matching your Node version, ` +
          `or rebuild: cd node_modules/better-sqlite3 && npm run build-release.`
      );
    }
    throw err;
  }
}

export function openSqliteDatabase(path: string): Database.Database {
  const BetterSqlite3 = loadBetterSqlite3();
  const db = new BetterSqlite3(path);
  configureSqliteDatabase(db);
  return db;
}
