#!/usr/bin/env node
import { createMcpServer, defaultStoragePath } from './server';

export interface CliOptions {
  agentId: string;
  storagePath?: string;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let agentId = 'default-agent';
  let storagePath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--agent-id') {
      agentId = argv[i + 1] ?? agentId;
      i += 1;
      continue;
    }

    if (arg === '--storage') {
      storagePath = argv[i + 1] ?? storagePath;
      i += 1;
    }
  }

  return { agentId, storagePath };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const server = createMcpServer({
    agentId: options.agentId,
    storagePath: options.storagePath ?? defaultStoragePath()
  });

  await server.start();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start @learningnodes/elen-mcp: ${message}\n`);
    process.exit(1);
  });
}
