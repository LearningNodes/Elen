#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveProjectId, ProjectResolveError } from '@learningnodes/elen';
import { Elen } from '@learningnodes/elen';
import { defaultStoragePath } from './server';
import { runClaim } from './claim';

const requireConsolidator = createRequire(__filename);

export interface CliGlobalOptions {
  agentId: string;
  projectId: string;
  storagePath: string;
}

export function buildElenFromCli(opts: CliGlobalOptions): Elen {
  return new Elen({
    agentId: opts.agentId,
    projectId: opts.projectId,
    storage: 'sqlite',
    sqlitePath: opts.storagePath
  });
}

export async function runCliCommand(argv: string[], globals: CliGlobalOptions): Promise<void> {
  const [cmd, ...rest] = argv;
  const elen = buildElenFromCli(globals);

  switch (cmd) {
    case 'status': {
      const meta = elen.getStatus();
      process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
      return;
    }
    case 'consolidate': {
      const apply = rest.includes('--apply');
      const suggestions = await elen.consolidate();
      if (apply) {
        const backup = elen.backup();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = requireConsolidator('@learningnodes/elen-consolidator') as Record<string, unknown>;
        const consolidateFn = pkg.consolidate;
        if (typeof consolidateFn !== 'function') {
          throw new Error('@learningnodes/elen-consolidator did not export consolidate()');
        }
        const daemon = (consolidateFn as (path: string) => unknown)(globals.storagePath);
        process.stdout.write(
          JSON.stringify({ mode: 'apply', backup, daemon, ...suggestions }, null, 2) + '\n'
        );
      } else {
        process.stdout.write(JSON.stringify({ mode: 'suggest', ...suggestions }, null, 2) + '\n');
      }
      return;
    }
    case 'project': {
      const sub = rest[0];
      if (sub === 'rename') {
        const [, oldId, newId] = rest;
        if (!oldId || !newId) throw new Error('Usage: elen project rename <old> <new>');
        const result = elen.renameProject(oldId, newId);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
      }
      if (sub === 'merge') {
        const args = rest.slice(1);
        if (args.length < 2) throw new Error('Usage: elen project merge <src...> <dest>');
        const dest = args[args.length - 1];
        const sources = args.slice(0, -1);
        const result = elen.mergeProjects(sources, dest);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
      }
      throw new Error('Usage: elen project rename|merge ...');
    }
    case 'prune': {
      let project: string | undefined;
      for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === '--project') project = rest[i + 1];
      }
      const result = elen.prune({ project });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'backup': {
      const dest = rest[0];
      const path = elen.backup(dest);
      process.stdout.write(JSON.stringify({ path }, null, 2) + '\n');
      return;
    }
    case 'export': {
      const out = rest[0] ?? 'elen-export.json';
      const bundle = elen.exportJson();
      writeFileSync(out, JSON.stringify(bundle, null, 2));
      process.stdout.write(JSON.stringify({ path: out, records: bundle.records.length }, null, 2) + '\n');
      return;
    }
    case 'import': {
      const file = rest[0];
      if (!file) throw new Error('Usage: elen import <file.json>');
      const bundle = JSON.parse(readFileSync(file, 'utf-8'));
      const result = elen.importJson(bundle);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'stats': {
      const stats = elen.getStats();
      process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
      return;
    }
    case 'claim': {
      const cloudUrl = process.env.ELEN_CLOUD_URL;
      const apiKey = process.env.ELEN_API_KEY ?? process.env.ELEN_CLOUD_API_KEY;
      if (!cloudUrl) {
        throw new Error('claim requires ELEN_CLOUD_URL to be set');
      }
      if (!apiKey) {
        throw new Error('claim requires ELEN_API_KEY (or ELEN_CLOUD_API_KEY) to be set');
      }
      await runClaim({
        projectId: globals.projectId,
        storagePath: globals.storagePath,
        cloudUrl,
        apiKey,
        agentId: globals.agentId
      });
      return;
    }
    default:
      throw new Error(
        `Unknown command: ${cmd ?? '(none)'}. Try: status | consolidate | project | prune | backup | export | import | stats | claim`
      );
  }
}

export function resolveCliGlobals(argv: string[]): {
  globals: CliGlobalOptions;
  commandArgv: string[];
} {
  let agentId = process.env.ELEN_AGENT_ID ?? 'default-agent';
  let explicitProject: string | undefined;
  let storagePath = process.env.ELEN_STORAGE ?? defaultStoragePath();
  const commandArgv: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agent-id') {
      agentId = argv[i + 1] ?? agentId;
      i += 1;
      continue;
    }
    if (arg === '--project') {
      explicitProject = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--storage') {
      storagePath = argv[i + 1] ?? storagePath;
      i += 1;
      continue;
    }
    commandArgv.push(arg);
  }

  const { projectId } = resolveProjectId({ explicitProject, cwd: process.cwd() });
  return { globals: { agentId, projectId, storagePath }, commandArgv };
}

export async function runElenCli(argv: string[]): Promise<void> {
  try {
    const { globals, commandArgv } = resolveCliGlobals(argv);
    if (commandArgv.length === 0) {
      const elen = buildElenFromCli(globals);
      const meta = elen.getStatus();
      process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
      return;
    }
    await runCliCommand(commandArgv, globals);
  } catch (err) {
    if (err instanceof ProjectResolveError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}
