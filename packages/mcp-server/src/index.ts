#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createMcpServer, defaultStoragePath } from './server';
import { startLocalApi } from './local-api';

// MCP SDK overrides the ambient `process` type, stripping cwd().
// We use execSync as a workaround.
const currentDir = (): string => execSync('cd', { encoding: 'utf-8' }).trim();

export interface CliOptions {
  agentId: string;
  projectId: string;
  storagePath?: string;
}

/**
 * Auto-detect project identity from the environment.
 * Priority: git remote name > package.json name > cwd basename > 'default'
 */
function detectProject(): string {
  // 1. Try git remote URL → extract repo name
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    // https://github.com/org/repo-name.git → repo-name
    // git@github.com:org/repo-name.git → repo-name
    const match = remote.match(/[/:]([^/]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {
    // Not a git repo or git not available
  }

  // 2. Try package.json name
  const pkgPath = resolve(currentDir(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        // Strip scope: @org/name → name
        return pkg.name.replace(/^@[^/]+\//, '');
      }
    } catch {
      // Malformed package.json
    }
  }

  // 3. Working directory basename
  return basename(currentDir()) || 'default';
}

export function parseCliArgs(argv: string[]): CliOptions {
  let agentId = 'default-agent';
  let projectId: string | undefined;
  let storagePath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--agent-id') {
      agentId = argv[i + 1] ?? agentId;
      i += 1;
      continue;
    }

    if (arg === '--project') {
      projectId = argv[i + 1] ?? projectId;
      i += 1;
      continue;
    }

    if (arg === '--storage') {
      storagePath = argv[i + 1] ?? storagePath;
      i += 1;
    }
  }

  return {
    agentId,
    projectId: projectId ?? detectProject(),
    storagePath
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  process.stderr.write(`✦ Elen MCP starting — agent: ${options.agentId}, project: ${options.projectId}\n`);

  const server = createMcpServer({
    agentId: options.agentId,
    projectId: options.projectId,
    storagePath: options.storagePath ?? defaultStoragePath()
  });

  await server.start();

  // Opt-in: start local HTTP API for the Elen Workstation
  if (process.env.ELEN_LOCAL_API === 'true') {
    const dbPath = options.storagePath ?? defaultStoragePath();
    const apiPort = parseInt(process.env.ELEN_API_PORT || '3333', 10);
    startLocalApi(dbPath, apiPort);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start @learningnodes/elen-mcp: ${message}\n`);
    process.exit(1);
  });
}
