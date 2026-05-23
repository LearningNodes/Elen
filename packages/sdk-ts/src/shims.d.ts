declare module 'nanoid' {
  export function nanoid(size?: number): string;
}

declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface DatabaseInstance {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    pragma(cmd: string): unknown;
    close(): void;
    transaction<T>(fn: (batch: T) => void): (batch: T) => void;
  }

  interface DatabaseConstructor {
    new (path: string): DatabaseInstance;
  }

  const Database: DatabaseConstructor;
  namespace Database {
    export type Database = DatabaseInstance;
  }

  export default Database;
}
