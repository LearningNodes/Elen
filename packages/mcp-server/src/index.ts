#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Elen, resolveProjectId, ProjectResolveError, resolveCredentials } from '@learningnodes/elen';
import { createMcpServer, defaultStoragePath } from './server';
import { startLocalApi } from './local-api';
import { runElenCli } from './cli';

const CLI_COMMANDS = new Set([
  'status',
  'consolidate',
  'project',
  'prune',
  'backup',
  'export',
  'import',
  'stats',
  'claim',
  'login',
  'whoami',
  'logout'
]);

export interface CliOptions {
  agentId: string;
  projectId: string;
  storagePath: string;
  connected: boolean;
  cloudUrl?: string;
  userEmail?: string;
  cloudApiKey?: string;
}

export function parseMcpArgs(argv: string[]): CliOptions {
  let agentId = process.env.ELEN_AGENT_ID ?? 'default-agent';
  let explicitProject: string | undefined;
  let storagePath = process.env.ELEN_STORAGE ?? defaultStoragePath();
  let connected = process.env.ELEN_CONNECTED === 'true' || process.env.ELEN_CONNECTED === '1';
  let cloudUrl = process.env.ELEN_CLOUD_URL;
  let userEmail = process.env.ELEN_USER_EMAIL;
  let cloudApiKey = process.env.ELEN_CLOUD_API_KEY;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agent-id') {
      agentId = argv[i + 1] ?? agentId;
      i += 1;
    } else if (arg === '--project') {
      explicitProject = argv[i + 1];
      i += 1;
    } else if (arg === '--storage') {
      storagePath = argv[i + 1] ?? storagePath;
      i += 1;
    } else if (arg === '--connected') {
      connected = true;
    } else if (arg === '--cloud-url') {
      cloudUrl = argv[i + 1] ?? cloudUrl;
      i += 1;
    } else if (arg === '--user-email') {
      userEmail = argv[i + 1] ?? userEmail;
      i += 1;
    }
  }

  const creds = resolveCredentials();
  if (cloudUrl === undefined) cloudUrl = creds.cloudUrl;
  if (userEmail === undefined) userEmail = creds.userEmail;
  if (cloudApiKey === undefined) cloudApiKey = creds.apiKey;

  const { projectId } = resolveProjectId({ explicitProject });
  return { agentId, projectId, storagePath, connected, cloudUrl, userEmail, cloudApiKey };
}

/** @deprecated Use parseMcpArgs — kept for tests */
export const parseCliArgs = parseMcpArgs;

async function startMcp(options: CliOptions) {
  const dbPath = options.storagePath;
  mkdirSync(dirname(dbPath), { recursive: true });

  const server = createMcpServer({
    agentId: options.agentId,
    projectId: options.projectId,
    storagePath: dbPath,
    connected: options.connected,
    cloudUrl: options.cloudUrl,
    userEmail: options.userEmail,
    cloudApiKey: options.cloudApiKey
  });

  const elen = new Elen({
    agentId: options.agentId,
    projectId: options.projectId,
    storage: options.connected ? 'cloud' : 'sqlite',
    sqlitePath: dbPath,
    apiUrl: options.cloudUrl,
    userEmail: options.userEmail,
    apiKey: options.cloudApiKey
  });

  let countLine = '';
  try {
    const meta = elen.getStatus();
    countLine = `, records: ${meta.total} (${meta.active} active)`;
    if (meta.hint) {
      process.stderr.write(`✦ Elen hint: ${meta.hint}\n`);
    }
  } catch {
    // cloud-only path may not expose local meta
  }

  const modeLabel = options.connected ? 'connected (cloud commits)' : 'local';
  process.stderr.write(
    `✦ Elen MCP — agent: ${options.agentId}, project: ${options.projectId}, db: ${dbPath}${countLine}, mode: ${modeLabel}\n`
  );

  await server.start();

  if (process.env.ELEN_LOCAL_API === 'true') {
    const apiPort = parseInt(process.env.ELEN_LOCAL_API_PORT || process.env.ELEN_API_PORT || '3333', 10);
    startLocalApi(dbPath, apiPort);
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === 'elen') {
    await runElenCli(argv.slice(1));
    return;
  }
  if (argv.length > 0 && CLI_COMMANDS.has(argv[0])) {
    await runElenCli(argv);
    return;
  }

  try {
    await startMcp(parseMcpArgs(argv));
  } catch (err) {
    if (err instanceof ProjectResolveError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start @learningnodes/elen-mcp: ${message}\n`);
    process.exit(1);
  });
}
