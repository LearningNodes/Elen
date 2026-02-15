declare module 'nanoid' {
  export function nanoid(size?: number): string;
}

declare module 'better-sqlite3' {
  interface Statement {
    run(params?: unknown): unknown;
    get(...params: unknown[]): unknown;
    all(params?: unknown): unknown[];
  }

  interface DatabaseInstance {
    exec(sql: string): void;
    prepare(sql: string): Statement;
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
