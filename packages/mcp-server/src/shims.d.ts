declare module '@modelcontextprotocol/sdk/server/index.js' {
  export class Server {
    constructor(info: { name: string; version: string }, options: { capabilities: { tools: Record<string, never> } });
    setRequestHandler(schema: unknown, handler: (request: any) => Promise<any>): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport { }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export const ListToolsRequestSchema: unknown;
  export const CallToolRequestSchema: unknown;
}

declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'node:os' {
  export function homedir(): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare const require: {
  main?: unknown;
};

declare const module: unknown;

declare const process: {
  argv: string[];
  stderr: { write: (message: string) => void };
  exit: (code?: number) => never;
};
